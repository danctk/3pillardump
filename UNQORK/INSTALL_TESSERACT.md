# Installing Tesseract OCR for PDF Processing

## Option 1: Install via Chocolatey (Requires Admin Rights)

1. Open PowerShell or Command Prompt **as Administrator**
2. Run:
   ```powershell
   choco install tesseract -y
   ```

## Option 2: Manual Installation (Recommended if no admin rights)

1. Download Tesseract OCR installer for Windows:
   - Go to: https://github.com/UB-Mannheim/tesseract/wiki
   - Download the latest installer (e.g., `tesseract-ocr-w64-setup-5.x.x.exe`)

2. Run the installer:
   - Install to default location: `C:\Program Files\Tesseract-OCR`
   - Make sure to check "Add to PATH" during installation, OR
   - Manually add `C:\Program Files\Tesseract-OCR` to your system PATH

3. Verify installation:
   ```powershell
   tesseract --version
   ```

4. If Tesseract is installed but not in PATH, you can specify the path in the Python script.

## Option 3: Portable Installation (No Admin Rights Needed)

1. Download portable version if available
2. Extract to a folder (e.g., `C:\Users\YourName\tesseract`)
3. Update the script to use the full path

## After Installation

Once Tesseract is installed, run:
```powershell
python ocr_pdfs.py
```

This will extract text from all PDFs in the `best practice` folder.


