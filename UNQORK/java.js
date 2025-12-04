const normalizeFileReferenceUrl = (url) => {
    // Extract the path manually from the URL string (everything after host)
    const urlObj = new URL(url);
    const host = `${urlObj.protocol}//${urlObj.host}`;
  
    // Remove host and query string
    let path = url.substring(host.length).split('?')[0]; 
  
    // Split by slashes and encode each segment
    const segments = path.split('/').map(s => encodeURIComponent(s));
    const normalizedPath = segments.join('/');
  
    return host + normalizedPath;
  };
  
  // Test it
  const testUrls = [
    "https://gxmstagfnstg.blob.core.windows.net/document-repo/document-repo/3610c13a-e7ca-40f7-986b-2cb320bd5eee/b8288a53-1d0c-4e9e-aaff-4c70b22c440c/tmp/19bce7ee-cc30-4c92-b626-f4eae18f0580/training sample - Walsh O'Brien Ireland_test payslips HSP"
  ];
  
  testUrls.forEach(u => {
    console.log("Input:", u);
    console.log("Output:", normalizeFileReferenceUrl(u));
    console.log("----");
  });
  