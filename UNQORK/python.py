# Payslip Matching Flow
# This workflow uses direct URL analysis with Azure Document Intelligence to process payslips
# from Azure Blob Storage without downloading files locally. It uses SAS tokens for secure
# access and is designed to be migrated to Azure Managed Identity authentication in the future.

import logging
import os
import io
import json
import re
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
import psycopg2
from prefect import flow, task, get_run_logger
from prefect.blocks.system import Secret
from urllib.parse import urlparse, parse_qs, unquote, quote
from azure.storage.blob import BlobServiceClient, ContainerClient, generate_blob_sas, BlobSasPermissions, ContentSettings
from azure.identity import DefaultAzureCredential
from azure.core.credentials import AzureKeyCredential
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeDocumentRequest, AnalyzeResult
from prefect import flow, task
from prefect.logging import get_run_logger
from prefect.blocks.system import Secret

# PDF processing
try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    # Fallback to older PyPDF2 if pypdf not available
    try:
        from PyPDF2 import PdfReader, PdfWriter
    except ImportError:
        PdfReader = None
        PdfWriter = None

# Enhanced date parsing
try:
    from dateutil import parser as date_parser
    DATEUTIL_AVAILABLE = True
except ImportError:
    DATEUTIL_AVAILABLE = False


# Global cache for secrets to avoid repeated API calls
_SECRET_CACHE = {}

def get_cached_secret(secret_name: str) -> str:
    """
    Get a secret from cache or load it if not cached.
    
    Args:
        secret_name: Name of the secret to load
        
    Returns:
        The secret value
    """
    if secret_name not in _SECRET_CACHE:
        _SECRET_CACHE[secret_name] = Secret.load(secret_name).get()
    return _SECRET_CACHE[secret_name]


def get_db_connection(environment: str = "staging"):
    """
    Get a database connection using cached credentials.
    
    Args:
        environment: The environment (staging/production)
        
    Returns:
        psycopg2 connection object
    """
    db_params = {
        'host': get_cached_secret(f'db-host-{environment}'),
        'database': get_cached_secret(f'db-name-{environment}'),
        'user': get_cached_secret(f'db-user-{environment}'),
        'password': get_cached_secret(f'db-password-{environment}'),
    }
    
    return psycopg2.connect(
        host=db_params['host'],
        dbname=db_params['database'],
        user=db_params['user'],
        password=db_params['password']
    )


# Utility functions
def extract_clean_blob_url(url: str) -> str:
    """
    Extract clean blob URL without SAS token or query parameters.
    Normalizes URL encoding to ensure consistency (e.g., parentheses are always encoded).
    
    Args:
        url: Full URL potentially with SAS token
        
    Returns:
        Clean URL without query parameters, with normalized encoding
        
    Example:
        Input:  "https://storage.blob.core.windows.net/container/file.pdf?sp=r&se=..."
        Output: "https://storage.blob.core.windows.net/container/file.pdf"
        
        Input:  "https://storage.blob.core.windows.net/container/file%20(test).pdf"
        Output: "https://storage.blob.core.windows.net/container/file%20%28test%29.pdf"
    """
    parsed = urlparse(url)
    # Normalize path encoding: unquote then quote to ensure consistent encoding
    # This handles cases where parentheses might be encoded or not: (test) vs %28test%29
    normalized_path = quote(unquote(parsed.path), safe='/')
    return f"{parsed.scheme}://{parsed.netloc}{normalized_path}"


def sanitize_url_for_logging(url: str, max_length: int = 100) -> str:
    """
    Sanitize URL for logging by removing SAS token but keeping the blob path.
    
    Args:
        url: Full blob URL with SAS token
        max_length: Maximum length of returned string
        
    Returns:
        Sanitized URL safe for logging
    """
    clean_url = extract_clean_blob_url(url)
    if len(clean_url) > max_length:
        return clean_url[:max_length] + "..."
    return clean_url


def uuid_to_ulid(uuid_str: str) -> str:
    """
    Convert UUID to ULID format (deterministic conversion).
    Matches the frontend implementation in useFileUpload.ts.
    
    The conversion extracts timestamp and randomness from the UUID itself,
    so the same UUID always produces the same ULID.
    
    Args:
        uuid_str: UUID string (with or without dashes)
        
    Returns:
        ULID string
    """
    # Base32 alphabet used by ULID (Crockford's Base32)
    base32_alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    
    # Remove dashes and validate
    hex_str = uuid_str.replace('-', '')
    if len(hex_str) != 32:
        raise ValueError("Invalid UUID")
    
    # Extract timestamp (first 12 hex chars) and randomness (remaining 20)
    timestamp = int(hex_str[:12], 16)
    randomness = hex_str[12:]
    
    # Encode timestamp to 10-char Base32
    time_part = ""
    temp_time = timestamp
    for _ in range(10):
        time_part = base32_alphabet[temp_time % 32] + time_part
        temp_time //= 32
    
    # Encode randomness to 16-char Base32
    # Pad randomness to 20 chars if needed
    randomness_padded = randomness.ljust(20, '0')
    rand_bytes = bytes.fromhex(randomness_padded)
    rand_num = int.from_bytes(rand_bytes, byteorder='big')
    
    rand_part = ""
    for _ in range(16):
        rand_part = base32_alphabet[rand_num % 32] + rand_part
        rand_num //= 32
    
    return time_part + rand_part[-16:]  # Take last 16 chars of rand_part


@task
def split_pdf_to_pages(
    pdf_url: str, 
    user_id: str,
    tenant_id: str,
    process_instance_id: str,
    environment: str = "staging"
) -> List[str]:
    """
    Download a PDF, split it into individual pages, upload each page to blob storage,
    and return URLs for each page.
    
    Args:
        pdf_url: URL to the PDF file (with SAS token)
        user_id: User ID who uploaded the file
        tenant_id: Tenant ID
        process_instance_id: Process instance ID
        environment: Environment (staging/production)
        
    Returns:
        List of URLs for each split page
    """
    logger = get_run_logger()
    
    if PdfReader is None or PdfWriter is None:
        logger.error("PDF library not available. Install pypdf or PyPDF2 to enable PDF splitting.")
        raise ImportError("PDF library (pypdf or PyPDF2) required for splitting")
    
    try:
        # Validate and regenerate SAS token if needed before downloading
        logger.info(f"Validating SAS token before splitting: {sanitize_url_for_logging(pdf_url)}")
        validated_url = generate_sas_url(pdf_url, environment)
        
        logger.info(f"Downloading PDF from URL for splitting...")
        
        # Download the PDF
        response = requests.get(validated_url, timeout=60)
        response.raise_for_status()
        pdf_bytes = response.content
        
        logger.info(f"Downloaded PDF, size: {len(pdf_bytes)} bytes")
        
        # Read the PDF
        pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
        num_pages = len(pdf_reader.pages)
        
        logger.info(f"PDF has {num_pages} page(s). Splitting into individual pages...")
        
        if num_pages == 1:
            logger.info("PDF has only 1 page, no splitting needed")
            return [validated_url]  # Return validated URL, not original
        
        # Extract original blob path info from URL
        parsed_url = urlparse(pdf_url)
        original_blob_path = parsed_url.path.lstrip('/')
        
        # Remove container name from path if present
        # Note: There's a folder "document-repo" inside the container "document-repo"
        # The path format is: "container-name/folder-name/path/file.pdf"  
        # We only remove the first part (container), keeping the folder and rest of path
        path_parts = original_blob_path.split('/', 1)
        if len(path_parts) > 1:
            original_blob_path = path_parts[1]
        
        logger.info(f"Extracted blob path from URL: {original_blob_path}")
        
        # Generate base name for split files
        # Handle URL-encoded filenames (e.g., Test%20in%20Bulk.pdf)
        original_filename = unquote(original_blob_path.split('/')[-1])
        base_filename = original_filename.rsplit('.', 1)[0]  # Remove .pdf extension
        blob_dir = '/'.join(original_blob_path.split('/')[:-1])  # Directory path
        
        logger.info(f"Original file: {original_filename}, will create split files in: {blob_dir}")
        
        # Get blob service client
        blob_service_client = get_blob_storage_client(environment)
        container_name = "document-repo"
        container_client = blob_service_client.get_container_client(container_name)
        
        logger.info(f"Split files will be uploaded to container '{container_name}' with blob path prefix: {blob_dir}/")
        
        # Validate that we have account key for SAS generation
        if not hasattr(blob_service_client.credential, 'account_key'):
            logger.error("Blob storage client does not have account_key. Cannot generate SAS tokens for split pages.")
            raise ValueError("PDF splitting requires storage account key for SAS token generation. Managed identity authentication is not supported for this operation.")
        
        split_urls = []
        
        # Split and upload each page
        for page_num in range(num_pages):
            # Create a new PDF with just this page
            pdf_writer = PdfWriter()
            pdf_writer.add_page(pdf_reader.pages[page_num])
            
            # Write to bytes
            page_bytes = io.BytesIO()
            pdf_writer.write(page_bytes)
            page_bytes.seek(0)
            
            # Create blob name for this page
            split_filename = f"{base_filename}_page{page_num + 1}.pdf"
            split_blob_path = f"{blob_dir}/{split_filename}"
            
            logger.info(f"Uploading page {page_num + 1}/{num_pages} as: {split_filename}")
            logger.info(f"Full blob path: {split_blob_path}")
            
            # Get file size
            page_bytes_value = page_bytes.getvalue()
            file_size = len(page_bytes_value)
            page_bytes.seek(0)
            
            # Upload to blob storage with metadata and tags
            try:
                blob_client = container_client.get_blob_client(split_blob_path)
                
                # Prepare metadata (will be updated with matched filename later during rename)
                metadata = {
                    'source_filename': original_filename,
                    'page_number': str(page_num + 1),
                    'total_pages': str(num_pages),
                    'original_file_name': quote(split_filename),  # Will be updated to matched filename
                    'file_size': str(file_size),
                    'file_type': 'application/pdf',
                    'user': user_id,
                    'file_name': quote(split_filename),  # Will be updated to matched filename
                    'created_at': datetime.utcnow().isoformat() + 'Z',
                    'file_object_type': 'PAYSLIP'
                }
                
                # Prepare tags (convert UUIDs to ULIDs to match frontend format)
                tags = {
                    'process': uuid_to_ulid(process_instance_id),
                    'tenant': uuid_to_ulid(tenant_id),
                    'isPublic': 'false'
                }
                
                upload_result = blob_client.upload_blob(
                    page_bytes, 
                    overwrite=True,
                    content_settings=ContentSettings(content_type='application/pdf'),
                    metadata=metadata,
                    tags=tags
                )
                logger.info(f"Upload result - ETag: {upload_result.get('etag', 'N/A')}, Last Modified: {upload_result.get('last_modified', 'N/A')}")
            except Exception as upload_error:
                logger.error(f"Failed to upload page {page_num + 1}: {str(upload_error)}")
                logger.error(f"Blob path attempted: {split_blob_path}")
                logger.error(f"Container: {container_name}")
                raise
            
            # Generate SAS URL for the split page
            blob_url = blob_client.url
            sas_token = generate_blob_sas(
                account_name=blob_service_client.account_name,
                container_name=container_name,
                blob_name=split_blob_path,
                account_key=blob_service_client.credential.account_key,
                permission=BlobSasPermissions(read=True),
                expiry=datetime.utcnow() + timedelta(days=1)
            )
            
            split_url = f"{blob_url}?{sas_token}"
            split_urls.append(split_url)
            
            logger.info(f"Page {page_num + 1} uploaded successfully to: {sanitize_url_for_logging(split_url)}")
        
        logger.info(f"Successfully split PDF into {len(split_urls)} pages")
        return split_urls
        
    except Exception as e:
        logger.error(f"Failed to split PDF: {str(e)}")
        raise


@task
def get_blob_storage_client(environment: str = "staging") -> BlobServiceClient:
    """
    Get an authenticated Azure Blob Storage client.
    """
    logger = get_run_logger()
    
    try:
        # Try to use connection string from Secret (cached)
        connection_string = get_cached_secret(f"azure-storage-connection-string-{environment}")
        logger.info("Using connection string from Secret block")
        return BlobServiceClient.from_connection_string(connection_string)
    except Exception as e:
        logger.info(f"Connection string not found in Secret block: {str(e)}")
        
        # Fall back to DefaultAzureCredential
        logger.info("Falling back to DefaultAzureCredential")
        account_url = f"https://{Secret.load(f'azure-storage-account-name-{environment}').get()}.blob.core.windows.net"
        # TODO: In the future, use managed identity for authentication
        return BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())


@task
def generate_sas_url(blob_path_or_url: str, environment: str = "staging") -> str:
    """
    Generate a SAS URL for a blob if it doesn't already have one.
    
    Args:
        blob_path_or_url: The path to the blob (container/path) or a URL that may already have a SAS token
    
    Returns:
        str: The SAS URL
    
    Note:
        This implementation uses SAS tokens for authentication. In a production environment,
        it's recommended to use Azure Managed Identity for enhanced security.
        
        Future Implementation Plan:
        1. Update the Document Intelligence client to use DefaultAzureCredential
        2. Configure RBAC permissions for the managed identity to access blob storage
        3. Remove the SAS token generation and use blob URLs directly
        4. Update the Azure Function App's identity configuration
    """
    logger = get_run_logger()
    
    # Check if the input is already a URL with a SAS token
    if blob_path_or_url.startswith('http') and '?' in blob_path_or_url:
        logger.debug(f"Validating existing SAS token in URL: {sanitize_url_for_logging(blob_path_or_url)}")
        # Validate SAS has read permission; otherwise regenerate
        try:
            parsed = urlparse(blob_path_or_url)
            qs = parse_qs(parsed.query)
            sp = (qs.get('sp', [''])[0] or '').lower()
            sr = (qs.get('sr', [''])[0] or '').lower()
            se = qs.get('se', [''])[0]  # Expiry time for logging
            
            logger.debug(f"SAS token details - Permissions (sp): '{sp}', Resource (sr): '{sr}', Expiry (se): '{se}'")
            
            # Check if SAS token is expired
            is_expired = False
            if se:
                try:
                    # Parse expiry time (format: 2025-09-26T11%3A13%3A23Z)
                    expiry_str = unquote(se).replace('Z', '+00:00')
                    expiry_time = datetime.fromisoformat(expiry_str)
                    current_time = datetime.now(expiry_time.tzinfo)
                    
                    if current_time >= expiry_time:
                        is_expired = True
                        logger.warning(f"SAS token has expired (expiry: {expiry_str}, current: {current_time.isoformat()}). Regenerating SAS token.")
                    else:
                        time_remaining = expiry_time - current_time
                        logger.debug(f"SAS token expires in {time_remaining} (at {expiry_str})")
                except Exception as e:
                    logger.warning(f"Could not parse SAS expiry time '{se}': {str(e)}. Will regenerate SAS to be safe.")
                    is_expired = True
            
            # If SAS explicitly lacks read permission, is expired, or appears container-scoped without read, regenerate
            if 'r' not in sp:
                logger.warning(f"SAS token lacks read permission (sp='{sp}'). Document Intelligence requires read access. Regenerating blob-level SAS with read permission.")
            elif is_expired:
                logger.warning(f"SAS token is expired. Regenerating blob-level SAS with read permission.")
            elif sr == 'c' and 'r' not in sp:
                # Extra guard; covered by the condition above
                logger.warning(f"SAS is container-scoped (sr='{sr}') without read permission (sp='{sp}'). Regenerating blob-level SAS with read permission.")
            else:
                logger.debug(f"SAS token is valid for Document Intelligence (has read permission and not expired). Using existing URL.")
                return blob_path_or_url
            # Fall-through to regenerate SAS below by extracting container/blob from URL
        except Exception as e:
            logger.error(f"Failed to validate existing SAS token: {str(e)}. Will attempt to regenerate SAS token.", exc_info=True)
    
    # If it's a URL (with invalid SAS or without SAS), extract the blob path
    if blob_path_or_url.startswith('http'):
        # Extract account name and container/blob path from URL
        try:
            parsed_url = urlparse(blob_path_or_url)
            # Format: https://<account>.blob.core.windows.net/<container>/<blob>
            path_parts = parsed_url.path.strip('/').split('/')
            if len(path_parts) < 2:
                raise ValueError(f"Cannot extract container/blob from URL: {blob_path_or_url}")
            container_name = path_parts[0]
            # URL decode the blob name to handle spaces and special characters
            blob_name = unquote('/'.join(path_parts[1:]))
            blob_path = f"{container_name}/{blob_name}"
            logger.debug(f"Extracted blob path from URL: {blob_path}")
        except Exception as e:
            logger.error(f"Failed to parse URL: {str(e)}")
            raise ValueError(f"Invalid blob URL: {blob_path_or_url}") from e
    else:
        # It's already a blob path
        blob_path = blob_path_or_url
    
    logger.debug(f"Generating new SAS URL for blob: {blob_path}")
    
    try:
        # Get connection string from Secret block (cached)
        connection_string = get_cached_secret(f"azure-storage-connection-string-{environment}")
        logger.debug(f"Retrieved storage connection string for environment: {environment}")
        
        # Parse the connection string
        account_name = None
        account_key = None
        for part in connection_string.split(';'):
            if part.startswith('AccountName='):
                account_name = part.split('=', 1)[1]
            elif part.startswith('AccountKey='):
                account_key = part.split('=', 1)[1]
        
        if not account_name or not account_key:
            logger.error("Failed to parse storage account name or key from connection string")
            raise ValueError("Could not parse connection string")
        
        logger.debug(f"Parsed storage account: {account_name}")
        
        # Split the blob path into container and blob name
        parts = blob_path.split('/', 1)
        if len(parts) != 2:
            logger.error(f"Invalid blob path format: {blob_path}. Expected format: container/blob")
            raise ValueError(f"Invalid blob path: {blob_path}")
        
        container_name, blob_name = parts
        logger.debug(f"Container: {container_name}, Blob: {blob_name}")
        
        # Create a BlobServiceClient
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        
        # Get a BlobClient
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        # Generate SAS token with 24-hour expiry
        expiry_time = datetime.utcnow() + timedelta(hours=24)
        logger.debug(f"Generating SAS token with read permission, expires at: {expiry_time.isoformat()}Z")
        
        # TODO: In the future, replace this with managed identity authentication
        sas_token = generate_blob_sas(
            account_name=account_name,
            container_name=container_name,
            blob_name=blob_name,
            account_key=account_key,
            permission=BlobSasPermissions(read=True),
            expiry=expiry_time
        )
        
        # Create the SAS URL
        sas_url = f"{blob_client.url}?{sas_token}"
        
        logger.debug(f"Successfully generated SAS URL: {sanitize_url_for_logging(sas_url)}")
        logger.debug(f"SAS token permissions: read=True, expiry: {expiry_time.isoformat()}Z")
        return sas_url
        
    except Exception as e:
        logger.error(f"Failed to generate SAS URL for blob '{blob_path}': {str(e)}", exc_info=True)
        raise


@task
def get_document_intelligence_client(environment: str = "staging") -> DocumentIntelligenceClient:
    """
    Get an authenticated Microsoft Document Intelligence client.
    
    Returns:
        DocumentIntelligenceClient: Authenticated client for Document Intelligence API
        
    Note:
        Currently using API key authentication via AzureKeyCredential.
        In the future, this should be updated to use DefaultAzureCredential for managed identity:
        
        ```python
        # Future implementation with managed identity
        endpoint = Secret.load("document-intelligence-endpoint").get()
        return DocumentIntelligenceClient(endpoint=endpoint, credential=DefaultAzureCredential())
        ```
    """
    logger = get_run_logger()
    
    try:
        # Try to use endpoint and key from Secret blocks
        endpoint = Secret.load(f"document-intelligence-endpoint-{environment}").get()
        key = Secret.load(f"document-intelligence-key-{environment}").get()
        logger.info(f"Using Document Intelligence endpoint: {endpoint}")
        return DocumentIntelligenceClient(endpoint=endpoint, credential=AzureKeyCredential(key))
    except Exception as e:
        logger.error(f"Failed to create Document Intelligence client: {str(e)}")
        raise


@task
def get_document_intelligence_model_id(environment: str = "staging") -> str:
    """
    Get the Document Intelligence model ID to use for analysis.
    
    Returns:
        The model ID to use (custom model or fallback to prebuilt)
    """
    logger = get_run_logger()
    
    try:
        # Try to get custom model ID from Secret
        model_id = Secret.load(f"document-intelligence-model-id-{environment}").get()
        logger.info(f"Using custom Document Intelligence model: {model_id}")
        return model_id
    except Exception as e:
        # Fall back to default custom model ID
        model_id = "HSP_payslips_beta_03"  # Default custom model for payslips
        logger.info(f"Custom model ID not found in Secret, using default: {model_id}")
        return model_id


@task
def list_blobs(blob_location: str, environment: str = "staging") -> List[str]:
    """
    List all blobs in the specified location.
    
    Args:
        blob_location: The Azure Blob Storage location (container/path)
        
    Returns:
        List of blob names
    """
    logger = get_run_logger()
    
    # Parse container and path from blob_location
    parts = blob_location.strip("/").split("/", 1)
    container_name = parts[0]
    prefix = parts[1] if len(parts) > 1 else ""
    
    logger.info(f"Listing blobs in container '{container_name}' with prefix '{prefix}'")
    
    blob_service_client = get_blob_storage_client(environment)
    container_client = blob_service_client.get_container_client(container_name)
    
    blobs = [blob.name for blob in container_client.list_blobs(name_starts_with=prefix)]
    logger.info(f"Found {len(blobs)} blobs")
    
    return blobs


@task
def analyze_document_from_url(document_url: str, environment: str = "staging") -> Dict[str, Any]:
    """
    Analyze a document using Microsoft Document Intelligence directly from a URL.
    
    Args:
        document_url: URL to the document (with SAS token if needed)
        
    Returns:
        Dictionary with extracted fields and confidence scores
        
    Note:
        This implementation uses Document Intelligence with direct URL analysis.
        Currently, the document URL requires a SAS token for authentication.
        
        Future Implementation Plan:
        1. Update to use Azure Managed Identity for Document Intelligence client authentication
        2. Configure RBAC permissions for the managed identity to access Document Intelligence
        3. Configure RBAC permissions for Document Intelligence to access blob storage
        4. Remove SAS token generation and pass direct blob URLs
    """
    logger = get_run_logger()
    logger.info(f"Starting document analysis from URL: {sanitize_url_for_logging(document_url)}")
    
    try:
        client = get_document_intelligence_client(environment)
        model_id = get_document_intelligence_model_id(environment)
        
        logger.info(f"Using Document Intelligence model: {model_id}")
        logger.info(f"Document Intelligence environment: {environment}")
        
        # Analyze the document directly from URL
        logger.info("Initiating Document Intelligence analysis...")
        poller = client.begin_analyze_document(
            model_id,
            AnalyzeDocumentRequest(url_source=document_url)
        )
        
        logger.info("Waiting for Document Intelligence analysis to complete...")
        result = poller.result()
        
        logger.info(f"Document Intelligence analysis completed successfully with model: {model_id}")
        
        # Log raw Document Intelligence result structure for debugging
        logger.info("Document Intelligence analysis result received")
        if hasattr(result, 'documents') and result.documents:
            logger.info(f"Number of documents detected: {len(result.documents)}")
            doc = result.documents[0]
            if hasattr(doc, 'fields'):
                raw_fields = list(doc.fields.keys()) if doc.fields else []
                logger.info(f"Raw fields detected by Document Intelligence: {raw_fields}")
            else:
                logger.warning("No fields attribute found in document result")
        else:
            logger.warning("No documents found in Document Intelligence result")
        
        # Extract payslip fields from the result
        logger.info("Extracting payslip fields from analysis result...")
        extracted_data = extract_payslip_fields(result)
        
        # Enhanced extraction summary with field details
        extracted_fields = [k for k, v in extracted_data.items() if v is not None and not k.endswith('_confidence')]
        logger.info(f"Successfully extracted {len(extracted_fields)} fields: {extracted_fields}")
        
        # Log each extracted field with its value and confidence
        for field_name, value in extracted_data.items():
            if not field_name.endswith('_confidence') and value is not None:
                confidence_key = f"{field_name}_confidence"
                confidence = extracted_data.get(confidence_key, 0.0)
                logger.info(f"  {field_name}: '{value}' (confidence: {confidence:.2f})")
        
        logger.info(f"Complete extracted data: {extracted_data}")
        
        return extracted_data
        
    except Exception as e:
        logger.error(f"Document Intelligence analysis failed for URL: {sanitize_url_for_logging(document_url)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        
        # Log additional context for common errors
        if "InvalidRequest" in str(e):
            logger.error("This is typically caused by:")
            logger.error("1. SAS token lacking read permission (sp parameter missing 'r')")
            logger.error("2. Expired SAS token")
            logger.error("3. Incorrect blob URL or blob doesn't exist")
            logger.error("4. Document Intelligence service cannot access the blob storage")
        elif "Unauthorized" in str(e):
            logger.error("This is typically caused by:")
            logger.error("1. Invalid Document Intelligence API key")
            logger.error("2. Incorrect Document Intelligence endpoint")
        elif "NotFound" in str(e):
            logger.error("This is typically caused by:")
            logger.error("1. Invalid Document Intelligence model ID")
            logger.error("2. Model not available in the specified region")
        
        logger.error("Full error details:", exc_info=True)
        raise


@task
def extract_payslip_fields(result) -> Dict[str, Any]:
    """
    Extract payslip fields directly from the custom model's analysis result.
    
    Args:
        result: The Document Intelligence analysis result
        
    Returns:
        Dictionary with extracted fields and confidence scores
    """
    logger = get_run_logger()
    
    # Initialize the payslip data structure with empty values and zero confidence
    payslip_data = {
        "employee_name": {"value": None, "confidence": 0.0},
        "employee_id": {"value": None, "confidence": 0.0},
        "employer": {"value": None, "confidence": 0.0},
        "payment_date": {"value": None, "confidence": 0.0},
        "net_pay": {"value": None, "confidence": 0.0},
        "pay_cycle": {"value": None, "confidence": 0.0}
    }
    
    # Extract fields directly from the custom model result
    logger.info("Starting field extraction from Document Intelligence result")
    if hasattr(result, 'documents') and result.documents:
        doc = result.documents[0]  # Get the first document
        logger.info(f"Processing document 1 of {len(result.documents)}")
        if hasattr(doc, 'fields'):
            fields = doc.fields
            logger.info(f"Document has {len(fields)} fields available for extraction")
            
            # Standardized field mapping between Document Intelligence model and application
            # Model fields -> Application fields
            field_mapping = {
                "employee_name": "employee_name",
                "employee_id": "employee_id", 
                "employer": "employer",
                "payment_date": "payment_date",
                "net_payment": "net_pay",  # Model uses 'net_payment', app uses 'net_pay'
                "net_pay": "net_pay",      # Support both field names for compatibility
                "pay_cycle": "pay_cycle"
            }
            
            logger.info("Processing field mappings...")
            for model_field, payslip_field in field_mapping.items():
                if model_field in fields and fields[model_field] is not None:
                    field = fields[model_field]
                    logger.info(f"Found field '{model_field}' in Document Intelligence result")
                    if hasattr(field, 'content') and field.content:
                        payslip_data[payslip_field]["value"] = field.content
                        # Use the confidence from the model if available
                        if hasattr(field, 'confidence'):
                            payslip_data[payslip_field]["confidence"] = field.confidence
                            logger.info(f"  Extracted {payslip_field}: '{field.content}' (confidence: {field.confidence:.2f})")
                        else:
                            logger.info(f"  Extracted {payslip_field}: '{field.content}' (no confidence score)")
                    else:
                        logger.info(f"  Field '{model_field}' found but has no content")
                else:
                    logger.debug(f"Field '{model_field}' not found in Document Intelligence result")
            
            # Log any additional fields that weren't in our mapping
            unmapped_fields = [f for f in fields.keys() if f not in field_mapping.keys()]
            if unmapped_fields:
                logger.info(f"Additional unmapped fields found in Document Intelligence result: {unmapped_fields}")
        else:
            logger.warning("Document has no fields attribute - extraction failed")
    else:
        logger.warning("No documents found in Document Intelligence result - extraction failed")
    
    # Convert the nested dict to a flat dict for compatibility with the rest of the code
    flat_data = {}
    for field, data in payslip_data.items():
        flat_data[field] = data["value"]
        flat_data[f"{field}_confidence"] = data["confidence"]
    
    return flat_data


@task
def find_matching_employees(employee_name: str, employee_id: Optional[str], tenant_id: str, environment: str = "staging") -> List[Dict[str, Any]]:
    """
    Find matching employees in the database using optimized query with CTE.
    
    Args:
        employee_name: The employee name to match
        employee_id: The employee ID to match (optional)
        tenant_id: The tenant ID
        environment: The environment (staging/production)
        
    Returns:
        List of matching employee records
        
    Performance Notes:
        - Uses CTE to compute name variations once
        - Leverages index on (tenant_id, employee_identifier, name)
        - Returns only essential fields to caller
        - Exact match optimization for employee_identifier
    """
    logger = get_run_logger()
    
    conn = get_db_connection(environment)
    cursor = conn.cursor()
    
    try:
        if employee_id:
            # Optimized: employee_identifier match uses index (tenant_id, employee_identifier)
            logger.info(f"Searching for employee with ID '{employee_id}' in tenant '{tenant_id}'")
            query = """
            SELECT id, name, last_name, other_name, preferred_name, employee_identifier
            FROM employee_profiles
            WHERE tenant_id = %s 
              AND employee_identifier = %s 
              AND "deletedAt" IS NULL
            """
            cursor.execute(query, (tenant_id, employee_id))
            
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if results:
                logger.info(f"Found {len(results)} employee(s) matching ID '{employee_id}'")
                return results
        
        # If no employee ID or no match by ID, try to match by name
        if not employee_name or not employee_name.strip():
            logger.warning("No employee name provided for matching")
            return []
            
        logger.info(f"Searching for employee with name '{employee_name}' in tenant '{tenant_id}'")
        
        # Prepare search pattern - normalize to lowercase for consistent matching
        search_pattern = employee_name.strip().lower()
        logger.info(f"Normalized search pattern: '{search_pattern}'")
        
        # Optimized query using CTE to compute name variations once
        # This avoids redundant CONCAT operations in WHERE and ORDER BY
        query = """
        WITH name_variants AS (
            SELECT 
                id, 
                name, 
                last_name, 
                other_name, 
                preferred_name, 
                employee_identifier,
                -- Compute all name variations once in CTE
                LOWER(TRIM(CONCAT(COALESCE(name, ''), ' ', COALESCE(other_name, ''), ' ', COALESCE(last_name, '')))) as name_western,
                LOWER(TRIM(CONCAT(COALESCE(last_name, ''), ' ', COALESCE(name, ''), ' ', COALESCE(other_name, '')))) as name_reverse,
                LOWER(TRIM(CONCAT(COALESCE(last_name, ''), ', ', COALESCE(name, ''), ' ', COALESCE(other_name, '')))) as name_comma,
                LOWER(TRIM(CONCAT(COALESCE(name, ''), ' ', COALESCE(last_name, '')))) as name_simple,
                -- Add variations WITHOUT middle name (other_name) for payslips that don't include middle names
                LOWER(TRIM(CONCAT(COALESCE(name, ''), ' ', COALESCE(last_name, '')))) as name_western_no_middle,
                LOWER(TRIM(CONCAT(COALESCE(last_name, ''), ' ', COALESCE(name, '')))) as name_reverse_no_middle,
                LOWER(COALESCE(preferred_name, '')) as name_preferred,
                LOWER(COALESCE(name, '')) as name_first,
                LOWER(COALESCE(last_name, '')) as name_last,
                LOWER(COALESCE(other_name, '')) as name_other
            FROM employee_profiles
            WHERE tenant_id = %s 
              AND "deletedAt" IS NULL
        )
        SELECT 
            id, 
            name, 
            last_name, 
            other_name, 
            preferred_name, 
            employee_identifier
        FROM name_variants
        WHERE 
            -- Exact matches (no wildcards = faster comparison)
            name_western = %s
            OR name_reverse = %s
            OR name_comma = %s
            OR name_simple = %s
            OR name_western_no_middle = %s
            OR name_reverse_no_middle = %s
            OR (name_preferred != '' AND name_preferred = %s)
            -- Partial matches as fallback
            OR name_first = %s
            OR name_last = %s
            OR name_other = %s
        ORDER BY 
            CASE 
                -- Prioritize exact full name matches (with or without middle name)
                WHEN name_western = %s THEN 1
                WHEN name_reverse = %s THEN 1
                WHEN name_comma = %s THEN 1
                WHEN name_simple = %s THEN 1
                WHEN name_western_no_middle = %s THEN 1
                WHEN name_reverse_no_middle = %s THEN 1
                -- Then preferred name
                WHEN name_preferred = %s THEN 2
                -- Then partial matches
                WHEN name_first = %s THEN 3
                WHEN name_last = %s THEN 3
                WHEN name_other = %s THEN 3
                ELSE 4
            END,
            name
        LIMIT 10
        """
        
        cursor.execute(query, (
            tenant_id,
            # WHERE clause patterns (10 total)
            search_pattern,      # Western format match
            search_pattern,      # Reverse format match
            search_pattern,      # Comma format match
            search_pattern,      # Simple format match
            search_pattern,      # Western format without middle name
            search_pattern,      # Reverse format without middle name
            search_pattern,      # Preferred name match
            search_pattern,      # First name match
            search_pattern,      # Last name match
            search_pattern,      # Other name match
            # ORDER BY patterns (10 total)
            search_pattern,      # ORDER BY: Western format
            search_pattern,      # ORDER BY: Reverse format
            search_pattern,      # ORDER BY: Comma format
            search_pattern,      # ORDER BY: Simple format
            search_pattern,      # ORDER BY: Western without middle
            search_pattern,      # ORDER BY: Reverse without middle
            search_pattern,      # ORDER BY: Preferred name
            search_pattern,      # ORDER BY: First name
            search_pattern,      # ORDER BY: Last name
            search_pattern       # ORDER BY: Other name
        ))
        
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        if results:
            logger.info(f"Found {len(results)} employee(s) matching name '{employee_name}'")
            # Log only summary for performance (avoid verbose logging)
            for result in results:
                logger.info(f"  Matched: {result.get('name', '')} {result.get('last_name', '')} (ID: {result.get('employee_identifier', '')})")
        else:
            logger.warning(f"No matches found for '{employee_name}' in tenant '{tenant_id}'")
        
        return results
    
    finally:
        cursor.close()
        conn.close()


# Note: Pay cycle validation removed since we don't have recurring cycle support yet
# Process instances include date/month only, no complex cycle matching needed

@task
def save_matching_result(
    tenant_id: str,
    process_instance_id: str,
    user_id: str,
    document_url: str,
    extracted_data: Dict[str, Any],
    employee_match: Optional[Dict[str, Any]],
    match_status: str,
    environment: str = "staging",
    performance_metrics: Optional[Dict[str, float]] = None,
    message_id: Optional[str] = None
) -> str:
    """
    Save the matching result to the database.
    
    Args:
        tenant_id: The tenant ID
        process_instance_id: The process instance ID (payroll process)
        user_id: The user ID
        document_url: The document URL
        extracted_data: The extracted data from the document
        employee_match: The matched employee record (if any)
        match_status: The match status
        environment: The environment (staging/production)
        performance_metrics: Optional performance timing metrics (extraction_time, matching_time, etc.)
        message_id: Optional message/batch ID to track upload sessions
        
    Returns:
        The ID of the created record
    """
    logger = get_run_logger()
    
    conn = get_db_connection(environment)
    cursor = conn.cursor()
    
    try:
        # Create audit log entry with performance metrics
        audit_log = {
            "events": [
                {
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "action": "initial_match",
                    "status": match_status,
                    "user_id": user_id,
                    "details": {
                        "extracted_data": extracted_data,
                        "employee_match": employee_match
                    },
                    "performance_metrics": performance_metrics or {}
                }
            ]
        }
        
        # Insert or update the record using UPSERT to handle reprocessing
        # This prevents duplicate records when the same document is processed multiple times
        # When updating, merge the new extracted_data with existing data to preserve metadata
        # The unique constraint includes message_id for batch tracking
        query = """
        INSERT INTO payslip_matching_results (
            tenant_id, 
            process_instance_id, 
            user_id, 
            file_reference, 
            extracted_data, 
            match_status, 
            audit_log,
            message_id
        )
        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s)
        ON CONFLICT (tenant_id, process_instance_id, user_id, file_reference, message_id)
        DO UPDATE SET
            extracted_data = payslip_matching_results.extracted_data || EXCLUDED.extracted_data,
            match_status = EXCLUDED.match_status,
            audit_log = jsonb_set(
                COALESCE(payslip_matching_results.audit_log, '{"events":[]}'::jsonb),
                '{events}',
                COALESCE(payslip_matching_results.audit_log->'events', '[]'::jsonb) || EXCLUDED.audit_log->'events'
            ),
            "updatedAt" = CURRENT_TIMESTAMP
        RETURNING id
        """
        
        # Extract clean blob path without SAS token for consistent file_reference
        try:
            clean_blob_url = extract_clean_blob_url(document_url)
            logger.info(f"Using clean blob URL as file_reference: {sanitize_url_for_logging(clean_blob_url)}")
        except Exception as e:
            logger.warning(f"Could not extract clean blob URL: {str(e)}. Using full URL.")
            clean_blob_url = document_url
        
        cursor.execute(
            query,
            (
                tenant_id,
                process_instance_id,
                user_id,
                clean_blob_url,  # Using clean blob URL without SAS token
                json.dumps(extracted_data),
                match_status,
                json.dumps(audit_log),
                message_id  # Always present (generated if not provided)
            )
        )
        
        record_id = cursor.fetchone()[0]
        conn.commit()
        
        logger.info(f"Created matching result record with ID {record_id} (batch: {message_id})")
        
        # Update blob tags with payslip ID (now that we have the database record ID)
        try:
            blob_service_client = get_blob_storage_client(environment)
            blob_client = blob_service_client.get_blob_client(
                container="document-repo",
                blob=clean_blob_url.split('/document-repo/')[-1]
            )
            
            # Get existing tags
            blob_properties = blob_client.get_blob_properties()
            current_tags = blob_properties.metadata.get('tags', {}) if hasattr(blob_properties, 'metadata') else {}
            
            # Get blob tags (different from metadata)
            try:
                current_tags = blob_client.get_blob_tags()
            except:
                current_tags = {}
            
            # Add payslip ID tag
            current_tags['payslip'] = uuid_to_ulid(record_id)
            
            # Update tags
            blob_client.set_blob_tags(tags=current_tags)
            logger.info(f"Updated blob tags with payslip ID: {record_id}")
        except Exception as tag_error:
            logger.warning(f"Failed to update blob tags with payslip ID: {str(tag_error)}")
            # Continue anyway - tag update is not critical for workflow
        
        return record_id
    
    except Exception as e:
        conn.rollback()
        logger.error(f"Error saving matching result: {str(e)}")
        raise
    
    finally:
        cursor.close()
        conn.close()


@task
def send_notification(user_id: str, process_instance_id: str, match_results: List[Dict[str, Any]], environment: str = "staging", message_id: Optional[str] = None) -> bool:
    """
    Send a notification to the user about the matching results.
    
    Args:
        user_id: The user ID to notify
        process_instance_id: The process instance ID (payroll process)
        match_results: The matching results
        environment: The environment (staging/production)
        message_id: Optional message/batch ID for tracking
        
    Returns:
        True if successful, False otherwise
    """
    logger = get_run_logger()
    
    try:
        notification_api_url = Secret.load(f'notification-api-url-{environment}').get()
    except Exception:
        logger.error(f"Notification API URL not found for environment: {environment}")
        return False
    
    # Get APIM subscription key for both staging and production environments
    headers = {"Content-Type": "application/json"}
    try:
        subscription_key = Secret.load(f'notification-api-subscription-key-{environment}').get()
        headers["Ocp-Apim-Subscription-Key"] = subscription_key
        logger.info(f"Using APIM subscription key for {environment} notification")
    except Exception as e:
        logger.error(f"APIM subscription key not found for {environment}: {str(e)}")
        return False
    
    payload = {
        "type": "payroll-payslip-processing-completion",
        "process": process_instance_id,  # Process ID required by notification API
        "message_id": message_id  # Backend changed to snake_case as of Oct 10, 2025 (commit acac85bd)
    }
    
    logger.info(f"Sending payroll-payslip-processing-completion notification to user {user_id} for process {process_instance_id} (batch: {message_id})")
    logger.info(f"Notification URL: {notification_api_url}")
    logger.info(f"Notification payload: {json.dumps(payload)}")
    logger.info(f"Notification headers: {json.dumps({k: v for k, v in headers.items() if k != 'Ocp-Apim-Subscription-Key'})}")
    
    try:
        response = requests.post(notification_api_url, json=payload, headers=headers)
        if response.status_code >= 200 and response.status_code < 300:
            logger.info(f"Successfully sent notification: {response.status_code}")
            return True
        else:
            logger.error(f"Failed to send notification: {response.status_code}, {response.text}")
            return False
    except Exception as e:
        logger.error(f"Exception when sending notification: {str(e)}")
        return False


@flow(name="payslip-matching")
def payslip_matching_flow(
    blob_location: str,
    user_id: str,
    process_instance_id: Optional[str] = None,
    split: bool = False,
    tenant_id: Optional[str] = None,
    document_urls: Optional[List[str]] = None,
    environment: str = "staging",
    task_id: Optional[str] = None,  # Backwards compatibility - alias for process_instance_id
    message_id: Optional[str] = None,  # Batch ID to track upload sessions (snake_case)
    messageId: Optional[str] = None  # Backend sends camelCase - alias for message_id
):
    """
    Main workflow for payslip matching.
    
    This workflow processes payslip documents stored in Azure Blob Storage using
    direct URL analysis with Document Intelligence. The workflow:
    
    1. Lists blobs in the specified location (or uses provided document URLs)
    2. For each blob, generates a SAS URL for secure access if needed
    3. Analyzes documents directly from URLs without downloading
    4. Extracts payslip fields using the custom HSP_payslips_beta_03 model
    5. Matches extracted employee data with database records
    6. Validates pay cycles and saves results
    
    If split=True, the workflow will download a single PDF, split it into pages,
    upload each page separately, and then process each page individually.
    
    Args:
        blob_location: The Azure Blob Storage location (container/path) or None if document_urls is provided
        user_id: The user ID
        process_instance_id: The process instance ID (payroll process)
        split: Whether to split the file into individual pages
        tenant_id: The tenant ID (optional, will be retrieved from process if not provided)
        document_urls: Optional list of document URLs with or without SAS tokens
        environment: The environment (staging/production)
        task_id: DEPRECATED - Use process_instance_id instead (kept for backwards compatibility)
        message_id: Optional batch ID to track files uploaded in the same session (snake_case)
        messageId: Optional batch ID from backend (camelCase) - alias for message_id
    """
    logger = get_run_logger()
    
    # Handle backwards compatibility: if task_id is provided but process_instance_id is not, use task_id
    if not process_instance_id and task_id:
        logger.warning(f"Using deprecated 'task_id' parameter. Please update to use 'process_instance_id' instead.")
        process_instance_id = task_id
    elif not process_instance_id:
        raise ValueError("Either 'process_instance_id' or 'task_id' must be provided")
    
    # Handle messageId from backend (camelCase) - convert to message_id (snake_case)
    if not message_id and messageId:
        message_id = messageId
        logger.info(f"Converted messageId to message_id: {message_id}")
    
    # Generate message_id if not provided to ensure batch uniqueness
    if not message_id:
        message_id = str(uuid.uuid4())
        logger.info(f"No message_id provided, generated: {message_id}")
    
    logger.info(f"Starting payslip matching workflow for {blob_location}")
    logger.info(f"Parameters: user_id={user_id}, process_instance_id={process_instance_id}, split={split}, message_id={message_id}")
    
    # If tenant_id is not provided, get it from the process
    if not tenant_id:
        conn = get_db_connection(environment)
        cursor = conn.cursor()
        
        try:
            query = "SELECT tenant_id FROM processes WHERE id = %s"
            cursor.execute(query, (process_instance_id,))
            result = cursor.fetchone()
            
            if result:
                tenant_id = result[0]
                logger.info(f"Retrieved tenant_id from process: {tenant_id}")
            else:
                logger.error(f"Process {process_instance_id} not found")
                return
        finally:
            cursor.close()
            conn.close()
    
    # If document_urls is provided, use those directly
    if document_urls:
        logger.info(f"Processing {len(document_urls)} provided document URLs")
        
        # Prepare URLs with SAS tokens
        sas_urls = []
        for i, url in enumerate(document_urls, 1):
            logger.info(f"Processing URL {i}/{len(document_urls)}: {sanitize_url_for_logging(url)}")
            try:
                # generate_sas_url will validate and potentially regenerate SAS tokens
                sas_url = generate_sas_url(url, environment)
                sas_urls.append(sas_url)
                logger.info(f"Successfully prepared URL {i}/{len(document_urls)} for Document Intelligence")
            except Exception as e:
                logger.error(f"Failed to prepare URL {i}/{len(document_urls)}: {str(e)}")
                logger.error(f"Problematic URL: {sanitize_url_for_logging(url)}")
                # Continue with other URLs even if one fails
                continue
        
        if not sas_urls:
            logger.error("No valid URLs could be prepared for processing")
            return
        
        logger.info(f"Successfully prepared {len(sas_urls)} out of {len(document_urls)} URLs for processing")
        
        # Handle PDF splitting if requested
        if split:
            logger.info("Split mode enabled - will split multi-page PDFs into individual pages")
            all_page_urls = []
            source_files = []  # Track original files that were split
            
            for i, pdf_url in enumerate(sas_urls, 1):
                logger.info(f"Checking PDF {i}/{len(sas_urls)} for splitting...")
                try:
                    # Split PDF into pages (returns original URL if only 1 page)
                    page_urls = split_pdf_to_pages(pdf_url, user_id, tenant_id, process_instance_id, environment)
                    
                    # If splitting produced multiple pages, the original is a source file
                    if len(page_urls) > 1:
                        source_files.append(pdf_url)
                        all_page_urls.extend(page_urls)
                        logger.info(f"PDF {i} split into {len(page_urls)} pages (original marked as source)")
                    else:
                        # Single page PDF, process normally
                        all_page_urls.extend(page_urls)
                        logger.info(f"PDF {i} has only 1 page, processing normally")
                except Exception as e:
                    logger.error(f"Failed to split PDF {i}: {str(e)}")
                    # Fall back to processing original PDF if splitting fails
                    all_page_urls.append(pdf_url)
            
            # Save source files with match_status="source" (don't extract/match)
            if source_files:
                logger.info(f"Saving {len(source_files)} source file(s) without extraction/matching")
                save_source_files(source_files, user_id, process_instance_id, tenant_id, environment, message_id)
            
            logger.info(f"After splitting: {len(all_page_urls)} page(s) to process")
            final_urls = all_page_urls
        else:
            final_urls = sas_urls
        
        # Process all files using their SAS URLs
        process_document_urls(final_urls, user_id, process_instance_id, tenant_id, environment=environment, message_id=message_id)
        
        # Rename matched payslips with employee names
        if message_id:
            logger.info("Renaming matched payslips with employee names...")
            rename_matched_payslips_with_employee_names(tenant_id, process_instance_id, message_id, environment)
        
        return
    
    # Otherwise, use blob_location to find and process files
    if not blob_location:
        logger.error("Either blob_location or document_urls must be provided")
        return
    
    # Get the list of blobs
    blobs = list_blobs(blob_location, environment)
    
    if not blobs:
        logger.warning(f"No blobs found in {blob_location}")
        return
    
    logger.info(f"Found {len(blobs)} blobs")
    
    # Generate SAS URLs for all blobs
    blob_urls = []
    for blob in blobs:
        blob_path = f"{blob_location}/{blob}"
        sas_url = generate_sas_url(blob_path, environment)
        blob_urls.append(sas_url)
    
    # If split is enabled, split multi-page PDFs into individual pages
    if split:
        logger.info("Split mode enabled - will split multi-page PDFs into individual pages")
        all_page_urls = []
        source_files = []  # Track original files that were split
        
        for i, pdf_url in enumerate(blob_urls, 1):
            logger.info(f"Checking PDF {i}/{len(blob_urls)} for splitting...")
            try:
                # Split PDF into pages (returns original URL if only 1 page)
                page_urls = split_pdf_to_pages(pdf_url, user_id, tenant_id, process_instance_id, environment)
                
                # If splitting produced multiple pages, the original is a source file
                if len(page_urls) > 1:
                    source_files.append(pdf_url)
                    all_page_urls.extend(page_urls)
                    logger.info(f"PDF {i} split into {len(page_urls)} pages (original marked as source)")
                else:
                    # Single page PDF, process normally
                    all_page_urls.extend(page_urls)
                    logger.info(f"PDF {i} has only 1 page, processing normally")
            except Exception as e:
                logger.error(f"Failed to split PDF {i}: {str(e)}")
                # Fall back to processing original PDF if splitting fails
                all_page_urls.append(pdf_url)
        
        # Save source files with match_status="source" (don't extract/match)
        if source_files:
            logger.info(f"Saving {len(source_files)} source file(s) without extraction/matching")
            save_source_files(source_files, user_id, process_instance_id, tenant_id, environment, message_id)
        
        logger.info(f"After splitting: {len(all_page_urls)} page(s) to process")
        process_document_urls(all_page_urls, user_id, process_instance_id, tenant_id, environment=environment, message_id=message_id)
    else:
        # Process PDFs directly without splitting
        process_document_urls(blob_urls, user_id, process_instance_id, tenant_id, environment=environment, message_id=message_id)
    
    # Rename matched payslips with employee names
    if message_id:
        logger.info("Renaming matched payslips with employee names...")
        rename_matched_payslips_with_employee_names(tenant_id, process_instance_id, message_id, environment)
    
    logger.info("Payslip matching workflow completed")


def get_existing_metadata(tenant_id: str, process_instance_id: str, file_reference: str, environment: str = "staging") -> Optional[Dict[str, Any]]:
    """
    Retrieve existing metadata from database record to preserve during reprocessing.
    
    Args:
        tenant_id: The tenant ID
        process_instance_id: The process instance ID
        file_reference: The clean file reference (blob URL without SAS)
        environment: The environment (staging/production)
        
    Returns:
        Dictionary of existing metadata or None if not found
    """
    logger = get_run_logger()
    
    try:
        conn = get_db_connection(environment)
        
        cursor = conn.cursor()
        
        # Look for existing record with same tenant, process_instance, and file_reference
        query = """
        SELECT extracted_data
        FROM payslip_matching_results
        WHERE tenant_id = %s AND process_instance_id = %s AND file_reference = %s
        ORDER BY "createdAt" DESC
        LIMIT 1
        """
        
        cursor.execute(query, (tenant_id, process_instance_id, file_reference))
        result = cursor.fetchone()
        
        if result and result[0]:
            existing_data = json.loads(result[0])
            # Only return metadata fields, not Document Intelligence fields
            metadata_fields = ['fileSize', 'payslipId', 'original_filename']
            metadata = {k: v for k, v in existing_data.items() if k in metadata_fields}
            
            if metadata:
                logger.info(f"Retrieved existing metadata: {metadata}")
                return metadata
        
        return None
        
    except Exception as e:
        logger.warning(f"Could not retrieve existing metadata: {str(e)}")
        return None
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@task
def process_single_document(document_url: str, user_id: str, process_instance_id: str, tenant_id: str, environment: str = "staging", message_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Process a single document from its URL.
    
    Args:
        document_url: Document URL with SAS token
        user_id: The user ID
        process_instance_id: The process instance ID (payroll process)
        tenant_id: The tenant ID
        environment: The environment (staging/production)
        message_id: Optional batch ID for tracking upload sessions
        
    Returns:
        Dictionary with processing result
    """
    logger = get_run_logger()
    start_time = time.time()
    
    try:
        logger.info(f"Processing document URL: {sanitize_url_for_logging(document_url)}")
        
        # Extract data from the document using direct URL analysis
        extraction_start = time.time()
        extracted_data = analyze_document_from_url(document_url, environment)
        extraction_time = time.time() - extraction_start
        
        # Get blob metadata (file size, upload time) from storage
        try:
            parsed_url = urlparse(document_url)
            path_parts = parsed_url.path.lstrip('/').split('/', 1)
            
            if len(path_parts) == 2:
                container_name = path_parts[0]
                blob_path = path_parts[1]
                
                # Note: The blob storage has a folder "document-repo" inside container "document-repo"
                # This causes URLs like /document-repo/document-repo/path/file.pdf
                # We need to keep the folder as part of the blob path, NOT strip it
                # So blob_path should be: document-repo/69e567f7.../file.pdf
                
                # CRITICAL: URL-decode the blob path since Azure stores with actual characters
                # URLs have %20 for spaces, but Azure storage uses actual spaces in blob names
                blob_path = unquote(blob_path)
                
                # Get blob service client and fetch properties
                blob_service_client = get_blob_storage_client(environment)
                blob_client = blob_service_client.get_blob_client(
                    container=container_name,
                    blob=blob_path
                )
                
                properties = blob_client.get_blob_properties()
                
                # Add blob metadata to extracted data
                extracted_data["fileSize"] = properties.size
                extracted_data["blobUploadedAt"] = properties.last_modified.isoformat()
                
                # Check if this is a split page with source_filename metadata
                blob_metadata = properties.metadata or {}
                if 'source_filename' in blob_metadata:
                    # This is a split page - use the source filename
                    extracted_data["original_filename"] = blob_metadata['source_filename']
                    extracted_data["page_number"] = blob_metadata.get('page_number')
                    extracted_data["total_pages"] = blob_metadata.get('total_pages')
                    logger.info(f"Split page detected - Source: {blob_metadata['source_filename']}, Page: {blob_metadata.get('page_number')}/{blob_metadata.get('total_pages')}")
                else:
                    # Regular file - use the blob filename
                    extracted_data["original_filename"] = unquote(blob_path.split('/')[-1])
                
                logger.info(f"Added blob metadata - Size: {properties.size} bytes, Uploaded: {properties.last_modified}")
            else:
                logger.warning(f"Could not parse blob path from URL: {parsed_url.path}")
        except Exception as e:
            logger.warning(f"Could not fetch blob metadata: {str(e)}")
            logger.warning(f"Error type: {type(e).__name__}")
            # Fallback: try to add filename from URL
            try:
                parsed_url = urlparse(document_url)
                filename = unquote(parsed_url.path.split('/')[-1])
                if filename and filename != '':
                    extracted_data["original_filename"] = filename
            except Exception:
                pass
        
        # Preserve original metadata by checking for existing database record
        # and merging with Document Intelligence results
        try:
            # Extract clean blob URL to check for existing record
            clean_blob_url = extract_clean_blob_url(document_url)
            
            # Check if there's an existing record with metadata to preserve
            existing_metadata = get_existing_metadata(tenant_id, process_instance_id, clean_blob_url, environment)
            if existing_metadata:
                logger.info(f"Found existing metadata to preserve: {list(existing_metadata.keys())}")
                # Merge existing metadata with Document Intelligence results
                # Document Intelligence results take precedence for payslip fields
                # New blob metadata also takes precedence over old metadata
                merged_data = {**existing_metadata, **extracted_data}
                extracted_data = merged_data
                logger.info(f"Merged data - preserved metadata + Document Intelligence results + blob metadata")
        except Exception as e:
            logger.warning(f"Could not preserve existing metadata: {str(e)}")
        
        logger.info(f"Final extracted_data keys: {list(extracted_data.keys())}")
        
        # Find matching employees
        employee_name = extracted_data.get("employee_name")
        employee_id = extracted_data.get("employee_id")
        
        matching_start = time.time()
        if not employee_name and not employee_id:
            logger.warning(f"No employee name or ID extracted from document")
            match_status = "extraction_failed"
            employee_match = None
        else:
            matching_employees = find_matching_employees(employee_name, employee_id, tenant_id, environment)
            
            if not matching_employees:
                logger.warning(f"No matching employees found for {employee_name} (ID: {employee_id})")
                match_status = "no_match"
                employee_match = None
            elif len(matching_employees) == 1:
                # Single match found - create clean employee match object for audit
                raw_match = matching_employees[0]
                employee_match = {
                    "id": raw_match.get("id"),
                    "name": raw_match.get("name"),
                    "last_name": raw_match.get("last_name"),
                    "employee_identifier": raw_match.get("employee_identifier")
                }
                match_status = "matched"
                
                # Log extracted payment info for reference (no validation needed)
                payment_date = extracted_data.get("payment_date")
                pay_cycle = extracted_data.get("pay_cycle")
                logger.info(f"Extracted payment info - Date: {payment_date}, Cycle: {pay_cycle}")
                logger.info(f"Matched employee: {raw_match.get('name')} {raw_match.get('last_name')} (ID: {raw_match.get('employee_identifier')})")
            else:
                # Multiple matches found
                logger.warning(f"Multiple matching employees found for {employee_name} (ID: {employee_id})")
                match_status = "multiple_matches"
                employee_match = matching_employees
        
        matching_time = time.time() - matching_start
        
        # Log extraction and matching results
        extraction_success = employee_name is not None or employee_id is not None
        extraction_field_count = sum(1 for k, v in extracted_data.items() 
                                     if not k.endswith('_confidence') and v is not None 
                                     and k in ['employee_name', 'employee_id', 'employer', 'payment_date', 'net_pay', 'pay_cycle'])
        
        if extraction_success:
            logger.info(f"✓ Extraction: SUCCESS - Extracted {extraction_field_count} payslip fields")
        else:
            logger.warning(f"✗ Extraction: FAILED - No employee name or ID extracted")
        
        if match_status == "matched":
            logger.info(f"✓ Matching: MATCH - Found employee {employee_match.get('name', '')} {employee_match.get('last_name', '')} (ID: {employee_match.get('employee_identifier', '')})")
        elif match_status == "no_match":
            logger.warning(f"✗ Matching: NO_MATCH - No employee found for '{employee_name}' (ID: {employee_id})")
        elif match_status == "multiple_matches":
            logger.warning(f"⚠ Matching: MULTIPLE_MATCHES - Found {len(employee_match)} employees for '{employee_name}' (ID: {employee_id})")
        elif match_status == "extraction_failed":
            logger.warning(f"✗ Matching: SKIPPED - Extraction failed, no data to match")
        
        # Extract filename from URL for reference
        try:
            parsed_url = urlparse(document_url)
            path = parsed_url.path
            filename = path.split('/')[-1]  # Get last part of path
            if not filename:
                # Fallback if we couldn't extract a proper filename
                filename = document_url.split('/')[-1].split('?')[0]
                if not filename:
                    filename = f"document_{uuid.uuid4().hex[:8]}"
            logger.info(f"Extracted filename: {filename}")
        except Exception as e:
            # Fallback if URL parsing fails
            logger.warning(f"Could not extract filename from URL: {str(e)}")
            filename = f"document_{uuid.uuid4().hex[:8]}"
        
        # Save the matching result with performance metrics
        save_start = time.time()
        
        # Prepare performance metrics before save to include in audit
        performance_metrics = {
            "extraction_time_seconds": round(extraction_time, 3),
            "matching_time_seconds": round(matching_time, 3)
        }
        
        record_id = save_matching_result(
            tenant_id,
            process_instance_id,
            user_id,
            document_url,
            extracted_data,
            employee_match,
            match_status,
            environment,
            performance_metrics,
            message_id
        )
        save_time = time.time() - save_start
        total_time = time.time() - start_time
        
        # Add save and total time to metrics for return
        performance_metrics["save_time_seconds"] = round(save_time, 3)
        performance_metrics["total_time_seconds"] = round(total_time, 3)
        
        logger.info(f"Document processed successfully in {total_time:.2f}s (extraction: {extraction_time:.2f}s, matching: {matching_time:.2f}s, save: {save_time:.2f}s)")
        
        return {
            "success": True,
            "id": record_id,
            "file": filename,
            "match_status": match_status,
            "performance": performance_metrics
        }
    
    except Exception as e:
        total_time = time.time() - start_time
        
        # Extract filename for error reporting
        try:
            filename = document_url.split('/')[-1].split('?')[0] or "unknown"
        except:
            filename = "unknown"
        
        logger.error(f"Failed to process document '{filename}' in {total_time:.2f}s")
        logger.error(f"Document URL: {sanitize_url_for_logging(document_url)}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error(f"Processing context - user_id: {user_id}, process_instance_id: {process_instance_id}, tenant_id: {tenant_id}, environment: {environment}")
        
        # Log specific guidance based on error type
        if "HttpResponseError" in str(type(e)):
            logger.error("This appears to be an Azure service error. Check:")
            logger.error("1. SAS token permissions and expiry")
            logger.error("2. Document Intelligence service availability")
            logger.error("3. Network connectivity to Azure services")
        elif "ConnectionError" in str(type(e)):
            logger.error("This appears to be a network connectivity issue. Check:")
            logger.error("1. Internet connectivity")
            logger.error("2. Azure service endpoints")
            logger.error("3. Firewall/proxy settings")
        elif "psycopg2" in str(type(e)) or "database" in str(e).lower():
            logger.error("This appears to be a database connectivity issue. Check:")
            logger.error("1. Database connection parameters")
            logger.error("2. Database service availability")
            logger.error("3. Network connectivity to database")
        
        logger.error("Full error details:", exc_info=True)
        
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__,
            "file": filename,
            "performance": {"total_time": total_time}
        }


@task
def save_source_files(
    source_urls: List[str],
    user_id: str,
    process_instance_id: str,
    tenant_id: str,
    environment: str = "staging",
    message_id: Optional[str] = None
):
    """
    Save original multi-page PDF files as source/container files without extraction/matching.
    These are the original files that were split into individual pages.
    
    Args:
        source_urls: List of original PDF URLs that were split
        user_id: The user ID
        process_instance_id: The process instance ID
        tenant_id: The tenant ID
        environment: The environment (staging/production)
        message_id: Batch ID to track upload sessions
    """
    logger = get_run_logger()
    
    for source_url in source_urls:
        try:
            # Extract clean blob URL for file_reference
            clean_blob_url = extract_clean_blob_url(source_url)
            filename = unquote(clean_blob_url.split('/')[-1])
            
            logger.info(f"Saving source file: {filename}")
            
            # Create minimal extracted_data with just filename
            extracted_data = {
                "original_filename": filename,
                "source_file": True,
                "note": "Original multi-page file that was split into individual pages"
            }
            
            # Create audit log
            audit_log = {
                "events": [
                    {
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "action": "source_file_saved",
                        "status": "source",
                        "user_id": user_id,
                        "details": {
                            "note": "Original file marked as source, split pages processed separately"
                        }
                    }
                ]
            }
            
            # Save to database with match_status="source"
            conn = get_db_connection(environment)
            cursor = conn.cursor()
            
            try:
                query = """
                INSERT INTO payslip_matching_results (
                    tenant_id, 
                    process_instance_id, 
                    user_id, 
                    file_reference, 
                    extracted_data, 
                    match_status, 
                    audit_log,
                    message_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, process_instance_id, user_id, file_reference, message_id)
                DO UPDATE SET
                    match_status = EXCLUDED.match_status,
                    extracted_data = EXCLUDED.extracted_data,
                    audit_log = jsonb_set(
                        COALESCE(payslip_matching_results.audit_log, '{"events":[]}'::jsonb),
                        '{events}',
                        COALESCE(payslip_matching_results.audit_log->'events', '[]'::jsonb) || EXCLUDED.audit_log->'events'
                    ),
                    "updatedAt" = CURRENT_TIMESTAMP
                RETURNING id
                """
                
                cursor.execute(
                    query,
                    (
                        tenant_id,
                        process_instance_id,
                        user_id,
                        clean_blob_url,
                        json.dumps(extracted_data),
                        "source",  # match_status
                        json.dumps(audit_log),
                        message_id
                    )
                )
                
                record_id = cursor.fetchone()[0]
                conn.commit()
                logger.info(f"✓ Source file saved with ID: {record_id}")
                
            finally:
                cursor.close()
                conn.close()
                
        except Exception as e:
            logger.error(f"Failed to save source file {source_url}: {str(e)}")


def sanitize_filename(text: str) -> str:
    """
    Sanitize text for use in filenames by removing special characters.
    
    Args:
        text: Text to sanitize
        
    Returns:
        Sanitized text safe for filenames
    """
    # Remove or replace problematic characters
    text = text.replace('/', '_').replace('\\', '_')
    text = re.sub(r'[<>:"|?*]', '', text)
    # Replace multiple spaces/underscores with single underscore
    text = re.sub(r'[\s_]+', '_', text)
    # Remove leading/trailing underscores
    text = text.strip('_')
    return text


def generate_payslip_filename(
    employee_name: Optional[str],
    employee_id: Optional[str],
    pay_cycle: Optional[str],
    payment_date: Optional[str],
    sequence: Optional[int] = None,
    total: Optional[int] = None
) -> str:
    """
    Generate a standardized payslip filename.
    
    Format:
      Single: PS_FirstName_LastName_PayCycle.pdf
      Multiple: PS_FirstName_LastName_PayCycle_1.pdf
                PS_FirstName_LastName_PayCycle_2.pdf
    
    Args:
        employee_name: Employee's full name
        employee_id: Employee ID (fallback if name not available)
        pay_cycle: Pay cycle (e.g., "Mars 2024")
        payment_date: Payment date (fallback if pay_cycle not available)
        sequence: File sequence number (for duplicates)
        total: Total files for this employee/period
        
    Returns:
        Sanitized filename
        
    TODO: Future Enhancement - Per-Tenant Naming Conventions
    -------------------------------------------------------
    This function currently uses a hardcoded naming format. In the future, this should
    be made configurable per tenant to support different customer requirements.
    
    Potential implementation options:
    
    1. Database Configuration:
       CREATE TABLE payslip_naming_conventions (
           tenant_id UUID PRIMARY KEY,
           format_template TEXT,  -- e.g., "PS_{employee_name}_{pay_cycle}_{sequence}"
           separator CHAR(1) DEFAULT '_',
           date_format TEXT DEFAULT 'MMMM_YYYY',
           prefix TEXT DEFAULT 'PS'
       );
    
    2. Tenant Settings JSON:
       Add to tenants table: 
       payslip_naming: {
           "template": "{prefix}_{employee_name}_{period}_{seq}",
           "prefix": "Payslip",
           "separator": "-",
           "date_format": "YYYY-MM"
       }
    
    3. Template Engine:
       Use a template string with replaceable tokens that allows customers to define
       their own format: "{company}_{employee_last_name}_{employee_first_name}_{period}_{n}.pdf"
    
    Configurable fields could include:
    - Prefix (PS, Payslip, company name, custom)
    - Field order (name first vs date first)
    - Separator (underscore, dash, space)
    - Date format (Mars_2024, 2024-03, March_2024)
    - Name format (FirstName_LastName, LastName_FirstName, FullName)
    - Sequence format (_1, -1, (1), [1])
    
    When implementing, update both this function and rename_matched_payslips_with_employee_names()
    to query and use tenant-specific configuration.
    """
    # Determine employee identifier
    if employee_name:
        # Use employee name, replace spaces with underscores
        name_part = sanitize_filename(employee_name.replace(' ', '_'))
    elif employee_id:
        name_part = f"EmpID_{sanitize_filename(employee_id)}"
    else:
        name_part = "Unknown"
    
    # Determine period identifier
    if pay_cycle:
        period_part = sanitize_filename(pay_cycle.replace(' ', '_'))
    elif payment_date:
        # Format: YYYY-MM-DD or DD/MM/YY -> YYYY-MM-DD
        period_part = sanitize_filename(payment_date.replace('/', '-'))
    else:
        period_part = "NoDate"
    
    # Build filename
    base_name = f"PS_{name_part}_{period_part}"
    
    # Add sequence if multiple files
    if sequence is not None and total is not None and total > 1:
        base_name = f"{base_name}_{sequence}"
    
    return f"{base_name}.pdf"


@task
def rename_matched_payslips_with_employee_names(
    tenant_id: str,
    process_instance_id: str,
    message_id: str,
    environment: str = "staging"
):
    """
    Rename matched payslip files with employee names and pay periods.
    
    This task:
    1. Queries all matched files in the batch
    2. Groups by employee and pay period
    3. Generates standardized names
    4. Renames files in blob storage
    5. Updates database file_reference
    
    Args:
        tenant_id: Tenant ID
        process_instance_id: Process instance ID
        message_id: Message/batch ID
        environment: Environment (staging/production)
    """
    logger = get_run_logger()
    logger.info(f"Starting payslip rename for batch {message_id}")
    
    try:
        # Get database connection
        conn = get_db_connection(environment)
        cursor = conn.cursor()
        
        # Query only successfully matched files in this batch (exclude source, no_match, extraction_failed, etc.)
        cursor.execute("""
            SELECT 
                id,
                file_reference,
                extracted_data,
                match_status
            FROM payslip_matching_results
            WHERE tenant_id = %s
              AND process_instance_id = %s
              AND message_id = %s
              AND match_status = 'matched'
            ORDER BY "createdAt"
        """, (tenant_id, process_instance_id, message_id))
        
        records = cursor.fetchall()
        
        if not records:
            logger.info("No matched files to rename")
            return
        
        logger.info(f"Found {len(records)} files to potentially rename")
        
        # Parse records and group by employee + pay period
        grouped_files = {}  # Key: (employee_id, pay_period), Value: list of records
        
        for record in records:
            record_id, file_reference, extracted_data, match_status = record
            # extracted_data is already a dict (JSONB column), no need to parse
            
            employee_name = extracted_data.get('employee_name')
            employee_id = extracted_data.get('employee_id')
            pay_cycle = extracted_data.get('pay_cycle')
            payment_date = extracted_data.get('payment_date')
            
            # Create grouping key (use pay_cycle or payment_date)
            period_key = pay_cycle or payment_date or "unknown"
            group_key = (employee_id or employee_name or "unknown", period_key)
            
            if group_key not in grouped_files:
                grouped_files[group_key] = []
            
            grouped_files[group_key].append({
                'id': record_id,
                'file_reference': file_reference,
                'extracted_data': extracted_data,
                'employee_name': employee_name,
                'employee_id': employee_id,
                'pay_cycle': pay_cycle,
                'payment_date': payment_date
            })
        
        # Get blob service client
        blob_service_client = get_blob_storage_client(environment)
        
        renamed_count = 0
        
        # Process each group
        for group_key, files in grouped_files.items():
            employee_key, period_key = group_key
            total_files = len(files)
            
            logger.info(f"Processing group: {employee_key} - {period_key} ({total_files} file(s))")
            
            # Generate new names for each file in the group
            for idx, file_info in enumerate(files, 1):
                try:
                    old_file_reference = file_info['file_reference']
                    
                    # Generate new filename
                    new_filename = generate_payslip_filename(
                        employee_name=file_info['employee_name'],
                        employee_id=file_info['employee_id'],
                        pay_cycle=file_info['pay_cycle'],
                        payment_date=file_info['payment_date'],
                        sequence=idx if total_files > 1 else None,
                        total=total_files if total_files > 1 else None
                    )
                    
                    # Parse old blob path
                    parsed_url = urlparse(old_file_reference)
                    old_blob_path = unquote(parsed_url.path.lstrip('/'))  # Decode URL encoding
                    
                    # Remove container name if present
                    path_parts = old_blob_path.split('/', 1)
                    if len(path_parts) > 1:
                        old_blob_path = path_parts[1]
                    
                    # Build new blob path (same directory, new filename)
                    blob_dir = '/'.join(old_blob_path.split('/')[:-1])
                    new_blob_path = f"{blob_dir}/{new_filename}"
                    
                    # Build new file reference URL
                    new_file_reference = f"{parsed_url.scheme}://{parsed_url.netloc}/document-repo/{new_blob_path}"
                    
                    # Check if old and new names are the same
                    old_filename = old_blob_path.split('/')[-1]
                    if old_filename == new_filename:
                        logger.info(f"  Skipping rename: {old_filename} (already has correct name)")
                        # Still update database to add matched_filename if not present
                        cursor.execute("""
                            UPDATE payslip_matching_results
                            SET extracted_data = jsonb_set(extracted_data, '{matched_filename}', %s::jsonb),
                                "updatedAt" = CURRENT_TIMESTAMP
                            WHERE id = %s
                              AND (extracted_data->>'matched_filename' IS NULL 
                                   OR extracted_data->>'matched_filename' != %s)
                        """, (json.dumps(new_filename), file_info['id'], new_filename))
                        continue
                    
                    logger.info(f"  Renaming: {old_filename} -> {new_filename}")
                    
                    # Copy blob to new name with proper content type
                    container_name = "document-repo"
                    container_client = blob_service_client.get_container_client(container_name)
                    
                    old_blob_client = container_client.get_blob_client(old_blob_path)
                    new_blob_client = container_client.get_blob_client(new_blob_path)
                    
                    # Copy blob (preserves content)
                    new_blob_client.start_copy_from_url(old_blob_client.url)
                    
                    # Wait for copy to complete
                    copy_properties = new_blob_client.get_blob_properties()
                    while copy_properties.copy.status == 'pending':
                        time.sleep(0.1)
                        copy_properties = new_blob_client.get_blob_properties()
                    
                    if copy_properties.copy.status != 'success':
                        logger.error(f"  Failed to copy blob: {copy_properties.copy.status}")
                        continue
                    
                    # Set content type on new blob
                    new_blob_client.set_http_headers(content_settings=ContentSettings(content_type='application/pdf'))
                    
                    # Update metadata with matched filename
                    try:
                        # Get current metadata
                        blob_properties = new_blob_client.get_blob_properties()
                        current_metadata = blob_properties.metadata or {}
                        
                        # Get new file size
                        new_file_size = blob_properties.size
                        
                        # Update metadata with matched filename
                        current_metadata['original_file_name'] = quote(new_filename)
                        current_metadata['file_name'] = quote(new_filename)
                        current_metadata['file_size'] = str(new_file_size)
                        
                        # Set updated metadata
                        new_blob_client.set_blob_metadata(metadata=current_metadata)
                        logger.info(f"  Updated blob metadata with matched filename: {new_filename}")
                    except Exception as metadata_error:
                        logger.warning(f"  Failed to update blob metadata: {str(metadata_error)}")
                        # Continue anyway - metadata update is not critical
                    
                    # Delete old blob
                    old_blob_client.delete_blob()
                    
                    # Create audit log entry for rename
                    rename_audit_entry = {
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                        "action": "file_renamed",
                        "details": {
                            "old_filename": old_filename,
                            "new_filename": new_filename,
                            "reason": "Renamed to user-friendly format with employee name and pay period"
                        }
                    }
                    
                    # Update database with new file_reference, add matched_filename, and append audit log
                    cursor.execute("""
                        UPDATE payslip_matching_results
                        SET file_reference = %s,
                            extracted_data = jsonb_set(extracted_data, '{matched_filename}', %s::jsonb),
                            audit_log = jsonb_set(
                                COALESCE(audit_log, '{"events":[]}'::jsonb),
                                '{events}',
                                COALESCE(audit_log->'events', '[]'::jsonb) || %s::jsonb
                            ),
                            "updatedAt" = CURRENT_TIMESTAMP
                        WHERE id = %s
                    """, (new_file_reference, json.dumps(new_filename), json.dumps(rename_audit_entry), file_info['id']))
                    
                    renamed_count += 1
                    logger.info(f"  ✓ Renamed successfully")
                    
                except Exception as rename_error:
                    logger.error(f"  ✗ Failed to rename file: {str(rename_error)}")
                    # Continue with other files even if one fails
                    continue
        
        # Commit all database updates
        conn.commit()
        
        logger.info(f"Payslip rename completed: {renamed_count}/{len(records)} files renamed")
        
    except Exception as e:
        logger.error(f"Error in rename_matched_payslips_with_employee_names: {str(e)}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@task
def process_document_urls(document_urls: List[str], user_id: str, process_instance_id: str, tenant_id: str, max_workers: int = 3, environment: str = "staging", message_id: Optional[str] = None):
    """
    Process multiple documents from their URLs in parallel.
    
    Args:
        document_urls: List of document URLs with SAS tokens
        user_id: The user ID
        process_instance_id: The process instance ID (payroll process)
        tenant_id: The tenant ID
        max_workers: Maximum number of parallel workers (default: 3)
        environment: The environment (staging/production)
        message_id: Optional batch ID to track upload sessions
    """
    logger = get_run_logger()
    start_time = time.time()
    logger.info(f"Processing {len(document_urls)} documents with {max_workers} parallel workers")
    
    match_results = []
    failed_results = []
    performance_stats = {
        "total_documents": len(document_urls),
        "successful": 0,
        "failed": 0,
        "total_extraction_time": 0,
        "total_matching_time": 0,
        "total_save_time": 0
    }
    
    # Process documents in parallel
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_url = {
            executor.submit(process_single_document, url, user_id, process_instance_id, tenant_id, environment, message_id): url 
            for url in document_urls
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                result = future.result()
                
                if result["success"]:
                    match_results.append({
                        "id": result["id"],
                        "file": result["file"],
                        "match_status": result["match_status"]
                    })
                    performance_stats["successful"] += 1
                    
                    # Aggregate performance metrics
                    perf = result["performance"]
                    performance_stats["total_extraction_time"] += perf.get("extraction_time", 0)
                    performance_stats["total_matching_time"] += perf.get("matching_time", 0)
                    performance_stats["total_save_time"] += perf.get("save_time", 0)
                else:
                    failed_results.append({
                        "file": result["file"],
                        "error": result["error"]
                    })
                    performance_stats["failed"] += 1
                    
            except Exception as e:
                logger.error(f"Unexpected error processing {url}: {str(e)}")
                failed_results.append({
                    "file": url.split('/')[-1].split('?')[0] or "unknown",
                    "error": str(e)
                })
                performance_stats["failed"] += 1
    
    total_processing_time = time.time() - start_time
    performance_stats["total_processing_time"] = total_processing_time
    
    # Log performance summary
    logger.info(f"Parallel processing completed in {total_processing_time:.2f}s")
    
    # Count match statuses for summary
    matched_count = sum(1 for r in match_results if r.get('match_status') == 'matched')
    no_match_count = sum(1 for r in match_results if r.get('match_status') == 'no_match')
    multiple_match_count = sum(1 for r in match_results if r.get('match_status') == 'multiple_matches')
    extraction_failed_count = sum(1 for r in match_results if r.get('match_status') == 'extraction_failed')
    
    logger.info(f"Processing summary: {performance_stats['successful']}/{performance_stats['total_documents']} documents processed successfully ({(performance_stats['successful']/performance_stats['total_documents']*100):.1f}%)")
    logger.info(f"Match results: {matched_count} matched, {no_match_count} no match, {multiple_match_count} multiple matches, {extraction_failed_count} extraction failed")
    
    if performance_stats["successful"] > 0:
        avg_extraction = performance_stats["total_extraction_time"] / performance_stats["successful"]
        avg_matching = performance_stats["total_matching_time"] / performance_stats["successful"]
        avg_save = performance_stats["total_save_time"] / performance_stats["successful"]
        logger.info(f"Average times - Extraction: {avg_extraction:.2f}s, Matching: {avg_matching:.2f}s, Save: {avg_save:.2f}s")
    
    if failed_results:
        logger.warning(f"Failed to process {len(failed_results)} documents:")
        for failed in failed_results:
            logger.warning(f"  - {failed['file']}: {failed['error']}")
    
    # Send notification to the user
    if match_results:
        send_notification(user_id, process_instance_id, match_results, environment, message_id)
    
    logger.info(f"Processed {len(match_results)} documents successfully")
    return match_results


if __name__ == "__main__":
    # For local testing
    import sys
    
    # Check if direct URLs are provided as arguments
    if len(sys.argv) > 1 and sys.argv[1] == "--urls":
        # Use direct URLs mode
        document_urls = sys.argv[2:] if len(sys.argv) > 2 else []
        print(f"Processing {len(document_urls)} direct URLs")
        payslip_matching_flow(
            blob_location=None,
            user_id="test-user",
            process_instance_id="test-process-uuid",
            document_urls=document_urls
        )
    else:
        # Example with blob location
        payslip_matching_flow(
            blob_location="test-container/payslips",
            user_id="test-user",
            process_instance_id="test-process-uuid",
            split=False
        )


def demonstrate_url_encoding(filename: str) -> str:
    """
    Demonstrate how the existing script encodes URLs using the same logic as extract_clean_blob_url.
    This uses the exact same normalization: unquote then quote with safe='/'
    
    Args:
        filename: The filename to encode
        
    Returns:
        URL-encoded filename using the same logic as the existing script
    """
    # This mimics the exact logic from extract_clean_blob_url:
    # normalized_path = quote(unquote(parsed.path), safe='/')
    # We apply the same unquote then quote pattern
    normalized_filename = quote(unquote(filename), safe='/')
    return normalized_filename


# Test the URL encoding with the provided filename
if __name__ == "__main__":
    test_filename = "Barbara Single - Ekspert Switzerland_Demo_Payslip_2023"
    
    print("Testing URL encoding with existing script logic:")
    print("=" * 60)
    print(f"Original filename: {test_filename}")
    print()
    
    # Show the encoding process step by step
    print("Step-by-step encoding process:")
    print(f"1. Original: {test_filename}")
    
    # Step 1: unquote (in case it's already encoded)
    unquoted = unquote(test_filename)
    print(f"2. After unquote(): {unquoted}")
    
    # Step 2: quote with safe='/' (same as in extract_clean_blob_url)
    encoded = quote(unquoted, safe='/')
    print(f"3. After quote(safe='/'): {encoded}")
    
    print()
    print("Final encoded filename:")
    print(encoded)
