"""
Wait for Tesseract installation to complete, then run OCR on all PDFs.
"""

import os
import time
import subprocess
from pathlib import Path

def check_tesseract_installed():
    """Check if Tesseract is installed and accessible."""
    # Check common installation paths
    common_paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ]
    
    # Check if in PATH
    import shutil
    tesseract_cmd = shutil.which('tesseract')
    if tesseract_cmd:
        return tesseract_cmd
    
    # Check common paths
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    # Check Chocolatey installation
    chocolatey_path = r"C:\ProgramData\chocolatey\lib\tesseract\tools\tesseract.exe"
    if os.path.exists(chocolatey_path):
        return chocolatey_path
    
    return None

def check_pending_installation():
    """Check if Chocolatey installation is still pending."""
    pending_file = Path(r"C:\ProgramData\chocolatey\lib\tesseract\.chocolateyPending")
    return pending_file.exists()

def main():
    """Wait for installation and then run OCR."""
    print("Waiting for Tesseract OCR installation to complete...")
    print("This may take a few minutes. Checking every 10 seconds...\n")
    
    max_wait_time = 600  # 10 minutes max
    check_interval = 10  # Check every 10 seconds
    elapsed = 0
    
    while elapsed < max_wait_time:
        # Check if installation is still pending
        if check_pending_installation():
            print(f"Still installing... ({elapsed}s elapsed)")
            time.sleep(check_interval)
            elapsed += check_interval
            continue
        
        # Check if Tesseract is now available
        tesseract_path = check_tesseract_installed()
        if tesseract_path:
            print(f"\n✓ Tesseract found at: {tesseract_path}")
            print("Installation complete! Running OCR script...\n")
            
            # Run the OCR script
            import ocr_pdfs
            ocr_pdfs.main()
            return
        
        # Still not found, but pending file is gone
        print(f"Installation appears complete, but Tesseract not found yet. Waiting... ({elapsed}s)")
        time.sleep(check_interval)
        elapsed += check_interval
    
    print("\n❌ Timeout waiting for Tesseract installation.")
    print("Please check if installation completed successfully.")
    print("You can manually run 'python ocr_pdfs.py' once installation is complete.")

if __name__ == "__main__":
    main()






