import {
  ContainerClient,
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobClient,
} from '@azure/storage-blob';
import { parse, lastDayOfMonth, format } from 'date-fns';
import EmployeeProfile from '../../models/employee-profile';
import Entity from '../../models/entities';
import Process from '../../models/processes';
import PayslipMatchingResults from '../../models/payslip_matching_results';
import { Transaction } from 'sequelize';

const ESS_CONTAINER_NAME = 'ess';
const DOCUMENT_REPO_CONTAINER_NAME = 'document-repo';
const BLOB_STORAGE_DOMAIN = 'blob.core.windows.net';
const MAX_PAYSLIP_SEQUENCE_PER_PERIOD = 10;

/**
 * Utility functions for blob storage operations
 */
const getDocumentRepoContainerClient = (): ContainerClient => {
  const storageAccount = process.env.BLOB_STORAGE_ACCOUNT;
  const sasToken = process.env.BLOB_SAS_TOKEN;

  if (!storageAccount || !sasToken) {
    throw new Error(
      'Missing BLOB_STORAGE_ACCOUNT or BLOB_SAS_TOKEN in environment settings.'
    );
  }

  const containerUrl = `https://${storageAccount}.${BLOB_STORAGE_DOMAIN}/${DOCUMENT_REPO_CONTAINER_NAME}?${sasToken}`;
  return new ContainerClient(containerUrl);
};

const generateBlobStorageUrl = (
  storageAccount: string,
  containerName: string,
  blobPath: string
): string => {
  return `https://${storageAccount}.${BLOB_STORAGE_DOMAIN}/${containerName}/${blobPath}`;
};

interface PayslipFile {
  id: string;
  fileName: string;
  displayName: string;
  blobPath: string;
  fileSize: number;
  lastModified: Date;
  contentType: string;
  downloadUrl?: string;
  periodEndDate?: string;
  sequence?: string;
  year?: string;
}

interface TaxDocumentFile {
  id: string;
  fileName: string;
  displayName: string;
  blobPath: string;
  fileSize: number;
  lastModified: Date;
  contentType: string;
  downloadUrl?: string;
  docType?: string;
  year?: string;
  jurisdiction?: string;
}

interface ListPayslipsOptions {
  tenantId: string;
  entityId: string;
  employeeId: string;
  year?: string;
  page?: number;
  limit?: number;
}

interface ListTaxDocsOptions {
  tenantId: string;
  entityId: string;
  employeeId: string;
  year?: string;
  page?: number;
  limit?: number;
  isShowOnlyProcessedTaxDocs?: boolean;
}

interface EmployeeEntityData {
  employeeIdentifier: string;
  lastName: string;
  entityName: string;
}

interface ListPayslipsResult {
  payslips: PayslipFile[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface ListTaxDocsResult {
  taxDocs: TaxDocumentFile[];
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface TypedMatchedFile {
  process_instance_id: string;
  file_reference: string;
  extracted_data: any;
  match_status: string;
  tenant_id: string;
  user_id: string;
}

interface MoveFilesToEssContainerParams {
  matchedFiles: TypedMatchedFile[];
  transaction: Transaction;
}

const getESSContainerClient = () => {
  const storageAccount = process.env.BLOB_STORAGE_ACCOUNT;

  if (!storageAccount) {
    throw new Error('Missing BLOB_STORAGE_ACCOUNT in environment settings.');
  }

  const accountKey = process.env.BLOB_STORAGE_ACCOUNT_KEY;

  if (!accountKey) {
    throw new Error(
      'Missing BLOB_STORAGE_ACCOUNT_KEY in environment settings.'
    );
  }

  const sasToken = process.env.BLOB_SAS_TOKEN;

  if (!sasToken) {
    throw new Error('Missing BLOB_SAS_TOKEN in environment settings.');
  }

  const blobSasUrl = `https://${storageAccount}.blob.core.windows.net/${ESS_CONTAINER_NAME}?${sasToken}`;
  return new ContainerClient(blobSasUrl);
};

const getPayslipDisplayName = (
  entityName: string,
  employeeIdentifier: string,
  lastName: string,
  periodEndDate: string,
  sequence?: string,
  includeSequence: boolean = false
): string => {
  // Add sequence if explicitly requested or if it's not the default "001"
  const sequenceSuffix = includeSequence && sequence ? `_(${sequence})` : '';
  return `${entityName}_${employeeIdentifier}_${lastName}_Payslip_${periodEndDate.substring(0, 7)}${sequenceSuffix}`;
};

const getTaxDocDisplayName = (
  entityName: string,
  employeeIdentifier: string,
  lastName: string,
  year: string,
  docType: string,
  jurisdiction: string,
  sequence?: string,
  includeSequence: boolean = false
): string => {
  const sequenceSuffix = includeSequence && sequence ? `_(${sequence})` : '';
  return `${entityName}_${employeeIdentifier}_${lastName}_${year}_${docType}_${jurisdiction}${sequenceSuffix}`;
};

/**
 * Parse pay_cycle format to year and period_end_date
 * @param payCycle - Pay cycle string in format "Mon-YY" (e.g., "Feb-23")
 * @returns Object with year and periodEndDate in YYYY-MM-DD format
 */
const parsePayCycleToPeriodEndDate = (
  payCycle: string
): { year: string; periodEndDate: string } => {
  try {
    // Parse "Feb-23" format using date-fns
    const parsedDate = parse(payCycle, 'MMM-yy', new Date());

    // Get the last day of the month
    const lastDay = lastDayOfMonth(parsedDate);

    // Format as YYYY-MM-DD
    const periodEndDate = format(lastDay, 'yyyy-MM-dd');
    const year = format(lastDay, 'yyyy');

    return {
      year,
      periodEndDate,
    };
  } catch (error) {
    throw new Error(
      `Invalid pay_cycle format: ${payCycle}. Expected format: MMM-YY (e.g., Feb-23)`
    );
  }
};

/**
 * Get the employee path identifier for tax documents based on current configuration
 * This function centralizes the logic for whether to use employee ID (UUID) or employee_identifier
 * @param employee - The employee profile data
 * @returns The identifier to use in blob storage paths
 */
const getTaxDocsEmployeeIdPath = (employee: EmployeeProfile): string => {
  // TODO: Switch this flag to change between employee ID and employee_identifier
  const useEmployeeIdentifier = false; // Set to true to use employee_identifier instead of UUID

  return useEmployeeIdentifier ? employee.employee_identifier : employee.id;
};

/**
 * Get the complete directory path for employee documents in blob storage
 * @param employee - The employee profile data
 * @param documentType - The type of document (e.g., 'tax', 'payslips')
 * @returns The complete directory path: {tenantId}/{entityId}/{employeeId}/{documentType}/
 */
const getEmployeeDirPath = (
  employee: EmployeeProfile,
  documentType: string
): string => {
  const employeeId = getTaxDocsEmployeeIdPath(employee);
  return `${employee.tenant_id}/${employee.entity_id}/${employeeId}/${documentType}/`;
};

/**
 * Fetch employee and entity data for display name generation
 */
const getEmployeeEntityData = async (
  employeeId: string,
  entityId: string
): Promise<EmployeeEntityData> => {
  try {
    // Fetch employee and entity data in parallel
    const [employee, entity] = await Promise.all([
      EmployeeProfile.findByPk(employeeId, {
        attributes: ['employee_identifier', 'last_name'],
      }),
      Entity.findByPk(entityId, {
        attributes: ['name'],
      }),
    ]);

    if (!employee) {
      throw new Error(`Employee not found: ${employeeId}`);
    }

    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    return {
      employeeIdentifier: employee.employee_identifier,
      lastName: employee.last_name,
      entityName: entity?.name || '', // Fallback to empty string if null
    };
  } catch (error) {
    throw new Error(
      `Failed to fetch employee/entity data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const listEmployeePayslips = async (
  options: ListPayslipsOptions
): Promise<ListPayslipsResult> => {
  const {
    tenantId,
    entityId,
    employeeId,
    year,
    page = 1,
    limit = 10,
  } = options;

  // Validate required parameters
  if (!tenantId || !entityId || !employeeId) {
    throw new Error('tenantId, entityId, and employeeId are required');
  }

  // Fetch employee and entity data for display names
  const employeeEntityData = await getEmployeeEntityData(employeeId, entityId);

  const containerClient = getESSContainerClient();
  const payslips: PayslipFile[] = [];
  const periodCounts = new Map<string, number>(); // Track how many files per period

  try {
    // Build the folder path based on ESS structure: {tenantId}/{entityId}/{employeeId}/payslips/{year}/
    let folderPrefix = `${tenantId}/${entityId}/${employeeId}/payslips/`;
    if (year) {
      folderPrefix += `${year}/`;
    }

    // List blobs with the folder prefix
    const listOptions = {
      prefix: folderPrefix,
    };

    const blobs = containerClient.listBlobsFlat(listOptions);
    let totalCount = 0;

    // First pass: collect all valid payslips and count files per period
    const validPayslips: Array<{
      blob: any;
      fileName: string;
      periodEndDate: string;
      sequence: string;
      fileYear: string;
    }> = [];

    for await (const blob of blobs) {
      // Skip if it's a folder (ends with /)
      if (blob.name.endsWith('/')) {
        continue;
      }

      // Only process payslip files (following the naming convention: payslip_{periodEndDate}_{sequence}.{ext})
      const fileName = blob.name.split('/').pop() || '';
      const payslipMatch = fileName.match(
        /^payslip_(\d{4}-\d{2}-\d{2})_(\d+)\.(.+)$/
      );

      if (!payslipMatch) {
        continue; // Skip files that don't match the payslip naming convention
      }

      const [, periodEndDate, sequence, extension] = payslipMatch;
      const fileYear = periodEndDate.split('-')[0];

      // If year filter is specified, only include files from that year
      if (year && fileYear !== year) {
        continue;
      }

      totalCount++;
      validPayslips.push({
        blob,
        fileName,
        periodEndDate,
        sequence,
        fileYear,
      });

      // Count files per period
      const currentCount = periodCounts.get(periodEndDate) || 0;
      periodCounts.set(periodEndDate, currentCount + 1);
    }

    // Second pass: create payslip objects with appropriate display names
    for (const payslipData of validPayslips) {
      const { blob, fileName, periodEndDate, sequence, fileYear } = payslipData;
      const hasMultipleForPeriod = (periodCounts.get(periodEndDate) || 0) > 1;

      const displayName = getPayslipDisplayName(
        employeeEntityData.entityName,
        employeeEntityData.employeeIdentifier,
        employeeEntityData.lastName,
        periodEndDate,
        sequence,
        hasMultipleForPeriod // Include sequence if there are multiple files for this period
      );

      const payslipFile: PayslipFile = {
        id: blob.name, // Use blob path as unique ID
        fileName,
        displayName,
        blobPath: blob.name,
        fileSize: blob.properties.contentLength || 0,
        lastModified: blob.properties.lastModified || new Date(),
        contentType: blob.properties.contentType || 'application/octet-stream',
        periodEndDate,
        sequence,
        year: fileYear,
      };

      payslips.push(payslipFile);
    }

    // Sort payslips by period end date (newest first)
    payslips.sort((a, b) => {
      if (!a.periodEndDate || !b.periodEndDate) return 0;
      return (
        new Date(b.periodEndDate).getTime() -
        new Date(a.periodEndDate).getTime()
      );
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedPayslips = payslips.slice(startIndex, endIndex);

    return {
      payslips: paginatedPayslips,
      totalCount: totalCount,
      page: page,
      limit: limit,
      hasMore: endIndex < totalCount,
    };
  } catch (error) {
    throw new Error(
      `Failed to list employee payslips: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const listEmployeeTaxDocs = async (
  options: ListTaxDocsOptions
): Promise<ListTaxDocsResult> => {
  const {
    tenantId,
    entityId,
    employeeId,
    year,
    page = 1,
    limit = 10,
    isShowOnlyProcessedTaxDocs = true,
  } = options;

  // Validate required parameters
  if (!tenantId || !entityId || !employeeId) {
    throw new Error('tenantId, entityId, and employeeId are required');
  }

  // Fetch employee and entity data for display names
  const employeeEntityData = await getEmployeeEntityData(employeeId, entityId);

  // Create partial employee for path generation
  const partialEmployee: Partial<EmployeeProfile> = {
    id: employeeId,
    employee_identifier: employeeEntityData.employeeIdentifier,
    tenant_id: tenantId,
    entity_id: entityId,
  };

  const containerClient = getESSContainerClient();
  let taxDocs: TaxDocumentFile[] = [];
  let totalCount = 0;

  try {
    // Build the folder path using getEmployeeDirPath for consistency
    let folderPrefix = getEmployeeDirPath(
      partialEmployee as EmployeeProfile,
      'tax'
    );
    if (year) {
      folderPrefix += `${year}/`;
    }

    const listOptions = {
      prefix: folderPrefix,
    };

    const blobs = containerClient.listBlobsFlat(listOptions);

    if (isShowOnlyProcessedTaxDocs) {
      // Existing processed logic
      const docTypeCounts = new Map<string, number>();

      // First pass: collect valid tax docs and count
      const validTaxDocs: Array<{
        blob: any;
        fileName: string;
        docType: string;
        fileYear: string;
        jurisdiction: string;
        sequence?: string;
      }> = [];

      for await (const blob of blobs) {
        if (blob.name.endsWith('/')) continue;

        const fileName = blob.name.split('/').pop() || '';
        let taxDocMatch = fileName.match(
          /^tax_([^_]+)_(\d{4})_([^_]+)_(\d+)\.(.+)$/
        );
        let hasSequence = true;

        if (!taxDocMatch) {
          taxDocMatch = fileName.match(/^tax_([^_]+)_(\d{4})_([^.]+)\.(.+)$/);
          hasSequence = false;
        }

        if (!taxDocMatch) continue;

        const docType = taxDocMatch[1];
        const fileYear = taxDocMatch[2];
        const jurisdiction = taxDocMatch[3];
        const sequence = hasSequence ? taxDocMatch[4] : undefined;

        if (year && fileYear !== year) continue;

        totalCount++;
        validTaxDocs.push({
          blob,
          fileName,
          docType,
          fileYear,
          jurisdiction,
          sequence,
        });

        const docKey = `${docType}_${fileYear}_${jurisdiction}`;
        const currentCount = docTypeCounts.get(docKey) || 0;
        docTypeCounts.set(docKey, currentCount + 1);
      }

      // Second pass: build objects
      for (const taxDocData of validTaxDocs) {
        const { blob, fileName, docType, fileYear, jurisdiction, sequence } =
          taxDocData;
        const docKey = `${docType}_${fileYear}_${jurisdiction}`;
        const hasMultipleForType = (docTypeCounts.get(docKey) || 0) > 1;

        const displayName = getTaxDocDisplayName(
          employeeEntityData.entityName,
          employeeEntityData.employeeIdentifier,
          employeeEntityData.lastName,
          fileYear,
          docType,
          jurisdiction,
          sequence,
          hasMultipleForType
        );

        const taxDocFile: TaxDocumentFile = {
          id: blob.name,
          fileName,
          displayName,
          blobPath: blob.name,
          fileSize: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date(),
          contentType:
            blob.properties.contentType || 'application/octet-stream',
          docType,
          year: fileYear,
          jurisdiction,
        };

        taxDocs.push(taxDocFile);
      }

      // Sort by year desc, then docType asc
      taxDocs.sort((a, b) => {
        if (a.year !== b.year) {
          return (b.year || '').localeCompare(a.year || '');
        }
        return (a.docType || '').localeCompare(b.docType || '');
      });
    } else {
      // Unprocessed mode: Return all files, sorted by upload date
      for await (const blob of blobs) {
        if (blob.name.endsWith('/')) continue;

        const fileName = blob.name.split('/').pop() || '';
        let inferredYear = year; // Default to provided year (from path)

        // Try to infer year from filename if not provided (simple regex for 4-digit years)
        if (!inferredYear) {
          const yearMatch = fileName.match(/\b(20\d{2})\b/);
          inferredYear = yearMatch ? yearMatch[1] : undefined;
        }

        // Skip if year provided but doesn't match inferred (for consistency)
        if (year && inferredYear !== year) continue;

        totalCount++;

        const displayName = `${employeeEntityData.entityName}_${employeeEntityData.employeeIdentifier}_${employeeEntityData.lastName}_${fileName}`;

        const taxDocFile: TaxDocumentFile = {
          id: blob.name,
          fileName,
          displayName,
          blobPath: blob.name,
          fileSize: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified || new Date(),
          contentType:
            blob.properties.contentType || 'application/octet-stream',
          year: inferredYear,
          // docType, jurisdiction, sequence remain undefined for unprocessed
        };

        taxDocs.push(taxDocFile);
      }

      // Sort by lastModified desc (newest uploads first)
      taxDocs.sort(
        (a, b) =>
          (b.lastModified.getTime() || 0) - (a.lastModified.getTime() || 0)
      );
    }

    // Apply pagination (common to both modes)
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTaxDocs = taxDocs.slice(startIndex, endIndex);

    return {
      taxDocs: paginatedTaxDocs,
      totalCount,
      page,
      limit,
      hasMore: endIndex < totalCount,
    };
  } catch (error) {
    throw new Error(
      `Failed to list employee tax documents: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Generate a temporary download URL for a payslip or tax document file
 * @param blobPath - The full blob path in the ESS container
 * @param expiresInMinutes - URL expiration time in minutes (default: 15)
 * @returns Temporary download URL
 */
const generatePayslipDownloadUrl = async (
  blobPath: string,
  expiresInMinutes: number = 15
): Promise<string> => {
  const storageAccount = process.env.BLOB_STORAGE_ACCOUNT;
  const accountKey = process.env.BLOB_STORAGE_ACCOUNT_KEY;

  if (!storageAccount || !accountKey) {
    throw new Error(
      'Missing BLOB_STORAGE_ACCOUNT or BLOB_STORAGE_ACCOUNT_KEY in environment settings.'
    );
  }

  try {
    // Create shared key credential for SAS generation
    const sharedKeyCredential = new StorageSharedKeyCredential(
      storageAccount,
      accountKey
    );

    // Generate expiry time
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

    // Generate SAS query parameters
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: ESS_CONTAINER_NAME,
        blobName: blobPath,
        permissions: BlobSASPermissions.parse('r'), // read permission
        expiresOn: expiresOn,
      },
      sharedKeyCredential
    ).toString();

    // Construct the full URL
    const downloadUrl = `https://${storageAccount}.blob.core.windows.net/${ESS_CONTAINER_NAME}/${blobPath}?${sasToken}`;

    return downloadUrl;
  } catch (error) {
    throw new Error(
      `Failed to generate download URL: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Get available years for an employee's payslips
 * @param options - List options with tenantId, entityId, and employeeId
 * @returns Array of available years
 */
const getAvailableYears = async (options: {
  tenantId: string;
  entityId: string;
  employeeId: string;
}): Promise<string[]> => {
  const { tenantId, entityId, employeeId } = options;
  const containerClient = getESSContainerClient();
  const years = new Set<string>();

  try {
    const folderPrefix = `${tenantId}/${entityId}/${employeeId}/payslips/`;
    const blobs = containerClient.listBlobsFlat({ prefix: folderPrefix });

    for await (const blob of blobs) {
      // Extract year from blob path
      const pathParts = blob.name.split('/');
      const payslipsIndex = pathParts.indexOf('payslips');

      if (payslipsIndex !== -1 && pathParts[payslipsIndex + 1]) {
        const year = pathParts[payslipsIndex + 1];
        // Validate that it's a 4-digit year
        if (/^\d{4}$/.test(year)) {
          years.add(year);
        }
      }
    }

    return Array.from(years).sort((a, b) => b.localeCompare(a)); // Sort newest first
  } catch (error) {
    throw new Error(
      `Failed to get available years: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Get available years for an employee's tax documents
 * @param options - List options with tenantId, entityId, and employeeId
 * @returns Array of available years
 */
const getTaxDocAvailableYears = async (options: {
  tenantId: string;
  entityId: string;
  employeeId: string;
}): Promise<string[]> => {
  const { tenantId, entityId, employeeId } = options;
  const containerClient = getESSContainerClient();
  const years = new Set<string>();

  try {
    const folderPrefix = `${tenantId}/${entityId}/${employeeId}/tax/`;
    const blobs = containerClient.listBlobsFlat({ prefix: folderPrefix });

    for await (const blob of blobs) {
      // Extract year from blob path
      const pathParts = blob.name.split('/');
      const taxIndex = pathParts.indexOf('tax');

      if (taxIndex !== -1 && pathParts[taxIndex + 1]) {
        const year = pathParts[taxIndex + 1];
        // Validate that it's a 4-digit year
        if (/^\d{4}$/.test(year)) {
          years.add(year);
        }
      }
    }

    return Array.from(years).sort((a, b) => b.localeCompare(a)); // Sort newest first
  } catch (error) {
    throw new Error(
      `Failed to get available tax document years: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Get payslip file count for an employee (optimized version that doesn't fetch full data)
 * @param options - List options with tenantId, entityId, and employeeId
 * @param year - Optional year filter
 * @returns Total count of payslip files
 */
const getPayslipCount = async (
  options: {
    tenantId: string;
    entityId: string;
    employeeId: string;
  },
  year?: string
): Promise<number> => {
  const { tenantId, entityId, employeeId } = options;
  const containerClient = getESSContainerClient();

  try {
    // Build the folder path
    let folderPrefix = `${tenantId}/${entityId}/${employeeId}/payslips/`;
    if (year) {
      folderPrefix += `${year}/`;
    }

    const listOptions = { prefix: folderPrefix };
    const blobs = containerClient.listBlobsFlat(listOptions);
    let count = 0;

    for await (const blob of blobs) {
      // Skip folders
      if (blob.name.endsWith('/')) {
        continue;
      }

      // Only count payslip files
      const fileName = blob.name.split('/').pop() || '';
      const payslipMatch = fileName.match(
        /^payslip_(\d{4}-\d{2}-\d{2})_(\d+)\.(.+)$/
      );

      if (!payslipMatch) {
        continue;
      }

      const [, periodEndDate] = payslipMatch;
      const fileYear = periodEndDate.split('-')[0];

      // If year filter is specified, only count files from that year
      if (year && fileYear !== year) {
        continue;
      }

      count++;
    }

    return count;
  } catch (error) {
    throw new Error(
      `Failed to get payslip count: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Get tax document file count for an employee (optimized version that doesn't fetch full data)
 * @param options - List options with tenantId, entityId, and employeeId
 * @param year - Optional year filter
 * @returns Total count of tax document files
 */
const getTaxDocCount = async (
  options: {
    tenantId: string;
    entityId: string;
    employeeId: string;
  },
  year?: string
): Promise<number> => {
  const { tenantId, entityId, employeeId } = options;
  const containerClient = getESSContainerClient();

  try {
    // Build the folder path
    let folderPrefix = `${tenantId}/${entityId}/${employeeId}/tax/`;
    if (year) {
      folderPrefix += `${year}/`;
    }

    const listOptions = { prefix: folderPrefix };
    const blobs = containerClient.listBlobsFlat(listOptions);
    let count = 0;

    for await (const blob of blobs) {
      // Skip folders
      if (blob.name.endsWith('/')) {
        continue;
      }

      // Only count tax document files (support both naming conventions)
      const fileName = blob.name.split('/').pop() || '';
      let taxDocMatch = fileName.match(
        /^tax_([^_]+)_(\d{4})_([^_]+)_(\d+)\.(.+)$/
      ); // With sequence

      if (!taxDocMatch) {
        taxDocMatch = fileName.match(/^tax_([^_]+)_(\d{4})_([^.]+)\.(.+)$/); // Without sequence
      }

      if (!taxDocMatch) {
        continue;
      }

      const fileYear = taxDocMatch[2];

      // If year filter is specified, only count files from that year
      if (year && fileYear !== year) {
        continue;
      }

      count++;
    }

    return count;
  } catch (error) {
    throw new Error(
      `Failed to get tax document count: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Fetch employee and process data required for file processing
 */
const fetchEmployeeAndProcessData = async (
  process_instance_id: string,
  tenant_id: string,
  employee_identifier: string,
  transaction: Transaction
) => {
  const [processRecord, employeeProfile] = await Promise.all([
    Process.findOne({
      where: { id: process_instance_id },
      attributes: ['entity', 'tenant_id'],
      transaction,
    }),
    EmployeeProfile.findOne({
      where: { tenant_id, employee_identifier },
      attributes: [
        'id',
        'employee_identifier',
        'tenant_id',
        'entity_id',
        'last_name',
      ],
      transaction,
    }),
  ]);

  if (!processRecord) {
    throw new Error(`Process not found: ${process_instance_id}`);
  }

  if (!employeeProfile) {
    throw new Error(
      `Employee not found with identifier: ${employee_identifier}`
    );
  }

  return { processRecord, employeeProfile };
};

/**
 * Get source blob client from file reference
 */
const getSourceBlobClient = async (
  file_reference: string,
  documentRepoContainer: ContainerClient
) => {
  const fileUrl = new URL(file_reference);
  const sourceBlobName = decodeURIComponent(
    fileUrl.pathname.replace(/^\/[^/]+\//, '')
  );

  const sourceBlobClient = documentRepoContainer.getBlobClient(sourceBlobName);

  const sourceExists = await sourceBlobClient.exists();
  if (!sourceExists) {
    throw new Error(
      `Source blob not found in document-repo: ${sourceBlobName}`
    );
  }

  return { sourceBlobClient, sourceBlobName };
};

/**
 * Find next available sequence number for a period
 */
const findNextAvailableSequence = async (
  essContainerClient: ContainerClient,
  yearPath: string,
  periodEndDate: string
): Promise<number> => {
  const existingBlobs = essContainerClient.listBlobsFlat({ prefix: yearPath });

  let maxSequence = 0;
  const periodPattern = new RegExp(
    `^${yearPath.replace(/\//g, '\\/')}payslip_${periodEndDate.replace(/-/g, '\\-')}_\\d+\\.`
  );

  for await (const blob of existingBlobs) {
    if (periodPattern.test(blob.name)) {
      const match = blob.name.match(/_(\d+)\.[^.]+$/);
      if (match) {
        const sequence = parseInt(match[1], 10);
        if (sequence > maxSequence) {
          maxSequence = sequence;
        }
      }
    }
  }

  const nextSequence = maxSequence + 1;

  if (nextSequence > MAX_PAYSLIP_SEQUENCE_PER_PERIOD) {
    throw new Error(
      `Exceeded maximum sequences (${MAX_PAYSLIP_SEQUENCE_PER_PERIOD}) for period ${periodEndDate}`
    );
  }

  return nextSequence;
};

/**
 * Copy blob from source to destination with metadata and tags
 * Does NOT delete the original - that happens after all operations succeed
 */
const copyBlobWithMetadata = async (
  sourceBlobClient: BlobClient,
  destinationBlobClient: BlobClient
) => {
  // Fetch source blob metadata and tags in parallel
  const [sourceProperties, sourceTags] = await Promise.all([
    sourceBlobClient.getProperties(),
    sourceBlobClient.getTags(),
  ]);

  // Copy blob content
  const copyPoller = await destinationBlobClient.beginCopyFromURL(
    sourceBlobClient.url
  );
  await copyPoller.pollUntilDone();

  // Set metadata and tags on destination blob to preserve searchability in GXM
  await Promise.all([
    destinationBlobClient.setMetadata(sourceProperties.metadata || {}),
    destinationBlobClient.setTags(sourceTags.tags || {}),
  ]);
};

/**
 * Process a single payslip file: copy to ESS and return operation details
 * Does NOT update database or delete original - those happen in separate phases
 */
const processSinglePayslipFile = async (
  file: TypedMatchedFile,
  transaction: Transaction,
  documentRepoContainer: ContainerClient,
  essContainerClient: ContainerClient,
  storageAccount: string
): Promise<{
  processInstanceId: string;
  oldFileReference: string;
  newFileReference: string;
  essBlobPath: string;
  sourceBlobClient: BlobClient;
} | null> => {
  const { process_instance_id, file_reference, extracted_data, tenant_id } =
    file;

  // Validate and parse pay_cycle
  if (!extracted_data?.pay_cycle) {
    console.warn(
      `Skipping file ${file_reference}: Missing pay_cycle in extracted_data`
    );
    return;
  }

  const { year, periodEndDate } = parsePayCycleToPeriodEndDate(
    extracted_data.pay_cycle
  );

  // Fetch employee and process data
  const { employeeProfile } = await fetchEmployeeAndProcessData(
    process_instance_id,
    tenant_id,
    extracted_data.employee_id,
    transaction
  );

  // Get source blob
  const { sourceBlobClient, sourceBlobName } = await getSourceBlobClient(
    file_reference,
    documentRepoContainer
  );

  // Determine destination path
  const basePath = getEmployeeDirPath(employeeProfile, 'payslips');
  const yearPath = `${basePath}${year}/`;

  const fileExtension = extracted_data.original_filename
    ? extracted_data.original_filename.split('.').pop() || 'pdf'
    : 'pdf';

  // Find next available sequence
  const nextSequence = await findNextAvailableSequence(
    essContainerClient,
    yearPath,
    periodEndDate
  );

  // Create destination blob
  const sequenceStr = String(nextSequence).padStart(3, '0');
  const destinationBlobName = `${yearPath}payslip_${periodEndDate}_${sequenceStr}.${fileExtension}`;
  const destinationBlobClient =
    essContainerClient.getBlobClient(destinationBlobName);

  // Copy blob with metadata and tags (but don't delete original yet)
  await copyBlobWithMetadata(sourceBlobClient, destinationBlobClient);

  const newFileReference = generateBlobStorageUrl(
    storageAccount,
    ESS_CONTAINER_NAME,
    destinationBlobName
  );

  console.log(
    `Copied payslip from ${sourceBlobName} to ${destinationBlobName}`
  );

  // Return operation details for database update and cleanup
  return {
    processInstanceId: process_instance_id,
    oldFileReference: file_reference,
    newFileReference,
    essBlobPath: destinationBlobName,
    sourceBlobClient,
  };
};

/**
 * Move released payslip files from document-repo to ESS container
 * Implements two-phase commit to prevent orphaned blobs:
 * Phase 1: Copy all files to ESS
 * Phase 2: Update database (if any fail, clean up ESS blobs)
 * Phase 3: Delete originals (only after DB commit succeeds)
 * @param params - Parameters object containing matchedFiles and transaction
 */
const moveFilesToEssContainer = async (
  params: MoveFilesToEssContainerParams
): Promise<void> => {
  const { matchedFiles, transaction } = params;
  const storageAccount = process.env.BLOB_STORAGE_ACCOUNT;

  if (!storageAccount) {
    throw new Error('Missing BLOB_STORAGE_ACCOUNT in environment settings.');
  }

  if (matchedFiles.length === 0) {
    return;
  }

  const documentRepoContainer = getDocumentRepoContainerClient();
  const essContainerClient = getESSContainerClient();

  // PHASE 1: Copy all files to ESS (with metadata/tags) in parallel
  const results = await Promise.allSettled(
    matchedFiles.map((file) =>
      processSinglePayslipFile(
        file,
        transaction,
        documentRepoContainer,
        essContainerClient,
        storageAccount
      )
    )
  );

  // Extract successful operations and check for failures
  const successfulOps: Array<{
    processInstanceId: string;
    oldFileReference: string;
    newFileReference: string;
    essBlobPath: string;
    sourceBlobClient: BlobClient;
  }> = [];

  const failures: Array<{ file: string; error: any }> = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      successfulOps.push(result.value);
    } else if (result.status === 'rejected') {
      failures.push({
        file: matchedFiles[index].file_reference,
        error: result.reason,
      });
    }
  });

  // If any operation failed, clean up ESS blobs and throw error
  if (failures.length > 0) {
    console.error('Failed to copy files to ESS container:', failures);

    // ROLLBACK: Delete all successfully copied ESS blobs
    if (successfulOps.length > 0) {
      console.log(`Cleaning up ${successfulOps.length} copied ESS blobs...`);
      await Promise.allSettled(
        successfulOps.map((op) =>
          essContainerClient.getBlobClient(op.essBlobPath).delete()
        )
      );
    }

    throw new Error(
      `Failed to copy ${failures.length} file(s) to ESS. First error: ${failures[0]?.error}`
    );
  }

  // PHASE 2: Update database with new file references
  try {
    await Promise.all(
      successfulOps.map((op) =>
        PayslipMatchingResults.update(
          { file_reference: op.newFileReference },
          {
            where: {
              process_instance_id: op.processInstanceId,
              file_reference: op.oldFileReference,
            },
            transaction,
          }
        )
      )
    );
  } catch (dbError) {
    // Database update failed - clean up ESS blobs
    console.error('Database update failed, cleaning up ESS blobs...', dbError);
    await Promise.allSettled(
      successfulOps.map((op) =>
        essContainerClient.getBlobClient(op.essBlobPath).delete()
      )
    );
    throw dbError; // Re-throw to rollback transaction
  }

  // PHASE 3: Delete originals from document-repo (best effort)
  // This happens AFTER database updates within the same transaction
  // If delete fails, file stays in both places (logged as warning)
  await Promise.allSettled(
    successfulOps.map(async (op) => {
      try {
        await op.sourceBlobClient.delete();
        console.log(`Deleted original blob: ${op.oldFileReference}`);
      } catch (deleteError) {
        console.warn(
          `Warning: Failed to delete blob from document-repo: ${op.oldFileReference}`,
          deleteError
        );
        // TODO: Notify admin about deletion failure
      }
    })
  );

  console.log(
    `Successfully migrated ${successfulOps.length} payslip(s) to ESS`
  );
};

/**
 * Helper function to convert matched files to typed format
 * @param items - Array of matched files with optional fields
 * @param tenant_id - Tenant ID to add to each item
 * @returns Array of TypedMatchedFile objects
 */
const toTypedMatchedFiles = (
  items: Array<{
    process_instance_id?: string;
    file_reference?: string;
    extracted_data?: any;
    match_status?: string;
    user_id?: string;
  }>,
  tenant_id: string
): TypedMatchedFile[] => {
  return items.map((item) => ({
    process_instance_id: item.process_instance_id!,
    file_reference: item.file_reference!,
    extracted_data: item.extracted_data,
    match_status: item.match_status!,
    tenant_id,
    user_id: item.user_id!,
  }));
};

/**
 * Wrapper function to process released payslips with minimal caller changes
 * Filters released files, extracts tenant_id, and moves files to ESS
 * @param matchedFiles - Array of matched files (may include non-released)
 * @param results - Array of update results containing matchingResult with tenant_id
 * @param transaction - Database transaction
 */
const processReleasedPayslips = async (
  matchedFiles: Array<{
    process_instance_id?: string;
    file_reference?: string;
    extracted_data?: any;
    match_status?: string;
    user_id?: string;
  }>,
  results: Array<{ matchingResult?: { tenant_id?: string } }>,
  transaction: Transaction
): Promise<void> => {
  // Filter for released files only
  const releasedFiles = matchedFiles.filter(
    (file) => file.match_status === 'released'
  );

  if (releasedFiles.length === 0) {
    return; // No released files to process
  }

  // Get tenant_id from first matching result
  const tenant_id = results[0]?.matchingResult?.tenant_id;

  if (!tenant_id) {
    throw new Error('Unable to determine tenant_id from results');
  }

  // Convert to typed format
  const typedFiles = toTypedMatchedFiles(releasedFiles, tenant_id);

  // Move files to ESS container
  await moveFilesToEssContainer({
    matchedFiles: typedFiles,
    transaction,
  });
};

export {
  listEmployeePayslips,
  listEmployeeTaxDocs,
  generatePayslipDownloadUrl,
  getAvailableYears,
  getTaxDocAvailableYears,
  getPayslipCount,
  getTaxDocCount,
  getTaxDocsEmployeeIdPath,
  getEmployeeDirPath,
  moveFilesToEssContainer,
  toTypedMatchedFiles,
  processReleasedPayslips,
};
export type {
  PayslipFile,
  TaxDocumentFile,
  ListPayslipsOptions,
  ListTaxDocsOptions,
  ListPayslipsResult,
  ListTaxDocsResult,
  TypedMatchedFile,
  MoveFilesToEssContainerParams,
};