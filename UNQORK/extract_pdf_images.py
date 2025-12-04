"""
Extract PDF pages as images so they can be processed with OCR later
or manually reviewed.
"""

import os
import sys
from pathlib import Path
import fitz  # PyMuPDF

def extract_pdf_images(pdf_path, output_dir):
    """Extract all pages from PDF as images."""
    try:
        print(f"Processing: {pdf_path.name}")
        doc = fitz.open(pdf_path)
        
        pdf_images_dir = output_dir / pdf_path.stem
        pdf_images_dir.mkdir(exist_ok=True)
        
        total_pages = len(doc)
        print(f"  Extracting {total_pages} pages as images...")
        
        for page_num in range(total_pages):
            page = doc[page_num]
            
            # Render page as high-quality image
            zoom = 2.0  # 2x zoom for better quality
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)
            
            # Save as PNG
            image_path = pdf_images_dir / f"page_{page_num + 1:03d}.png"
            pix.save(str(image_path))
            
            if (page_num + 1) % 10 == 0:
                print(f"    Processed {page_num + 1}/{total_pages} pages...")
        
        doc.close()
        print(f"  ✓ Saved {total_pages} images to: {pdf_images_dir}")
        return True
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def main():
    """Main function to extract images from all PDFs."""
    best_practice_dir = Path("best practice")
    output_dir = Path("best practice") / "extracted_images"
    
    if not best_practice_dir.exists():
        print(f"Error: '{best_practice_dir}' directory not found!")
        return
    
    # Create output directory
    output_dir.mkdir(exist_ok=True)
    
    # Find all PDFs
    pdf_files = list(best_practice_dir.glob("*.pdf"))
    
    if not pdf_files:
        print(f"No PDF files found in '{best_practice_dir}'")
        return
    
    print(f"Found {len(pdf_files)} PDF file(s) to process\n")
    
    success_count = 0
    for pdf_path in pdf_files:
        if extract_pdf_images(pdf_path, output_dir):
            success_count += 1
    
    print(f"\n{'='*60}")
    print(f"Extraction complete: {success_count}/{len(pdf_files)} PDFs processed")
    print(f"Images saved to: {output_dir}")
    print(f"\nNext steps:")
    print(f"1. Install Tesseract OCR from: https://github.com/UB-Mannheim/tesseract/wiki")
    print(f"2. Run ocr_pdfs.py again to extract text from the PDFs")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()


