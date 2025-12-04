import { MethodKind } from "@bufbuild/protobuf";

interface ServiceMethod {
    name: string;
    kind: MethodKind;
}

interface TokenService {
    typeName: string;
    methods: {
        getToken: ServiceMethod;
        streamToken: ServiceMethod;
    };
}

function analyzePatterns() {
    // Field patterns
    const fieldPattern = {
        number: 1,
        type: 9,
        combined: '19'
    };

    // Method patterns
    const methodPattern = {
        unary: 0,
        streaming: 1,
        combined: '01'
    };

    // Type patterns
    const typePatterns = {
        get: [0, 3, 8],
        stream: [0, 6, 11]
    };

    // Try combining all patterns
    const patterns = [
        fieldPattern.combined,
        methodPattern.combined,
        ...Object.values(typePatterns).map(p => p.join(''))
    ];

    console.log('Analyzing combined patterns:');
    for (const pattern of patterns) {
        console.log(`\nPattern: ${pattern}`);
        
        // Try base64 encoding
        const base64 = Buffer.from(pattern).toString('base64');
        console.log(`Base64: ${base64}`);
        
        // Try ASCII interpretation
        try {
            const ascii = parseInt(pattern);
            if (32 <= ascii && ascii <= 126) {
                console.log(`ASCII: ${String.fromCharCode(ascii)}`);
            }
        } catch {}

        // Try hex interpretation
        const hex = Buffer.from(pattern).toString('hex');
        console.log(`Hex: ${hex}`);
    }

    // Try combining patterns in different ways
    console.log('\nTrying pattern combinations:');
    
    // Combine field and method patterns
    const fieldMethod = fieldPattern.combined + methodPattern.combined;  // "1901"
    console.log(`\nField + Method: ${fieldMethod}`);
    console.log(`Base64: ${Buffer.from(fieldMethod).toString('base64')}`);
    
    // Combine all patterns
    const allPatterns = patterns.join('');
    console.log(`\nAll patterns: ${allPatterns}`);
    console.log(`Base64: ${Buffer.from(allPatterns).toString('base64')}`);
    
    // Try XOR of all numbers
    const xor = [...allPatterns].reduce((acc, char) => acc ^ parseInt(char), 0);
    console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
    
    // Try looking at the version numbers
    const versions = ['1.6.1', '1.10.0'];
    console.log('\nAnalyzing versions:');
    for (const version of versions) {
        const numbers = version.split('.').map(Number);
        console.log(`\nVersion ${version}:`);
        console.log(`Numbers: ${numbers.join('')}`);
        console.log(`Base64: ${Buffer.from(numbers.join('')).toString('base64')}`);
        
        // Try XOR of version numbers
        const versionXor = numbers.reduce((acc, num) => acc ^ num, 0);
        console.log(`XOR: ${versionXor} (chr: ${String.fromCharCode(versionXor)})`);
    }
}

function analyzeSpecificPatterns() {
    // The patterns we found
    const patterns = {
        field: "19",        // Field number (1) and type (9)
        method: "01",       // Method kinds (Unary=0, Streaming=1)
        getType: "038",     // Uppercase positions in GetToken*
        streamType: "0611"  // Uppercase positions in StreamToken*
    };

    console.log('Analyzing specific patterns:');
    
    // Try all possible combinations of these patterns
    const combinations = [
        patterns.field + patterns.method,                    // "1901"
        patterns.field + patterns.getType,                   // "19038"
        patterns.field + patterns.streamType,                // "190611"
        patterns.method + patterns.getType,                  // "01038"
        patterns.method + patterns.streamType,               // "010611"
        patterns.field + patterns.method + patterns.getType, // "1901038"
        patterns.field + patterns.method + patterns.streamType // "19010611"
    ];

    for (const combo of combinations) {
        console.log(`\nCombination: ${combo}`);
        
        // Try base64 encoding
        const base64 = Buffer.from(combo).toString('base64');
        console.log(`Base64: ${base64}`);
        
        // Try hex encoding
        const hex = Buffer.from(combo).toString('hex');
        console.log(`Hex: ${hex}`);
        
        // Try ASCII interpretation
        try {
            const ascii = parseInt(combo);
            if (32 <= ascii && ascii <= 126) {
                console.log(`ASCII: ${String.fromCharCode(ascii)}`);
            }
        } catch {}
        
        // Try XOR of digits
        const xor = [...combo].reduce((acc, digit) => acc ^ parseInt(digit), 0);
        console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
        
        // Try reversing the string
        const reversed = [...combo].reverse().join('');
        console.log(`Reversed: ${reversed}`);
        console.log(`Reversed base64: ${Buffer.from(reversed).toString('base64')}`);
    }

    // Try looking at the version numbers in a different way
    const versions = {
        connect: "1.6.1",
        protobuf: "1.10.0"
    };

    console.log('\nAnalyzing version numbers:');
    for (const [key, version] of Object.entries(versions)) {
        const numbers = version.split('.').map(Number);
        console.log(`\n${key} version ${version}:`);
        
        // Try different combinations of version numbers
        const versionCombos = [
            numbers.join(''),                    // "161" or "1100"
            numbers.reduce((a, b) => a + b, 0),  // Sum
            numbers.reduce((a, b) => a * b, 1),  // Product
            numbers.reduce((a, b) => a ^ b, 0)   // XOR
        ];

        for (const combo of versionCombos) {
            console.log(`Combination: ${combo}`);
            console.log(`Base64: ${Buffer.from(String(combo)).toString('base64')}`);
            const numericCombo = Number(combo);
            if (32 <= numericCombo && numericCombo <= 126) {
                console.log(`ASCII: ${String.fromCharCode(numericCombo)}`);
            }
        }
    }
}

function analyzeFinalPatterns() {
    // Key patterns we found
    const patterns = {
        fieldMethod: "1901",      // Field (19) + Method (01)
        versions: ["161", "1100"], // Version numbers
        typePositions: {
            get: "038",
            stream: "0611"
        }
    };

    console.log('Analyzing final patterns:');

    // Try combining version numbers with field/method pattern
    console.log('\nVersion combinations:');
    for (const version of patterns.versions) {
        const combined = patterns.fieldMethod + version;
        console.log(`\nField/Method + Version ${version}:`);
        console.log(`Combined: ${combined}`);
        console.log(`Base64: ${Buffer.from(combined).toString('base64')}`);
        
        // Try reversing
        const reversed = [...combined].reverse().join('');
        console.log(`Reversed: ${reversed}`);
        console.log(`Reversed base64: ${Buffer.from(reversed).toString('base64')}`);
        
        // Try XOR of all digits
        const xor = [...combined].reduce((acc, digit) => acc ^ parseInt(digit), 0);
        console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
    }

    // Try combining type positions with field/method pattern
    console.log('\nType position combinations:');
    for (const [type, pos] of Object.entries(patterns.typePositions)) {
        const combined = patterns.fieldMethod + pos;
        console.log(`\nField/Method + ${type} positions:`);
        console.log(`Combined: ${combined}`);
        console.log(`Base64: ${Buffer.from(combined).toString('base64')}`);
        
        // Try reversing
        const reversed = [...combined].reverse().join('');
        console.log(`Reversed: ${reversed}`);
        console.log(`Reversed base64: ${Buffer.from(reversed).toString('base64')}`);
        
        // Try XOR of all digits
        const xor = [...combined].reduce((acc, digit) => acc ^ parseInt(digit), 0);
        console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
    }

    // Try combining all patterns
    const allPatterns = [
        patterns.fieldMethod,
        ...patterns.versions,
        ...Object.values(patterns.typePositions)
    ];

    console.log('\nAll pattern combinations:');
    
    // Try all possible pairs
    for (let i = 0; i < allPatterns.length; i++) {
        for (let j = i + 1; j < allPatterns.length; j++) {
            const combined = allPatterns[i] + allPatterns[j];
            console.log(`\nCombining ${allPatterns[i]} and ${allPatterns[j]}:`);
            console.log(`Combined: ${combined}`);
            console.log(`Base64: ${Buffer.from(combined).toString('base64')}`);
            
            // Try reversing
            const reversed = [...combined].reverse().join('');
            console.log(`Reversed: ${reversed}`);
            console.log(`Reversed base64: ${Buffer.from(reversed).toString('base64')}`);
            
            // Try XOR of all digits
            const xor = [...combined].reduce((acc, digit) => acc ^ parseInt(digit), 0);
            console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
        }
    }

    // Try special combinations
    const specialCombos = [
        patterns.fieldMethod + patterns.versions.join(''),  // 19011611100
        patterns.fieldMethod + Object.values(patterns.typePositions).join(''),  // 19010380611
        patterns.versions.join('') + Object.values(patterns.typePositions).join('')  // 1611100380611
    ];

    console.log('\nSpecial combinations:');
    for (const combo of specialCombos) {
        console.log(`\nSpecial combination: ${combo}`);
        console.log(`Base64: ${Buffer.from(combo).toString('base64')}`);
        
        // Try reversing
        const reversed = [...combo].reverse().join('');
        console.log(`Reversed: ${reversed}`);
        console.log(`Reversed base64: ${Buffer.from(reversed).toString('base64')}`);
        
        // Try XOR of all digits
        const xor = [...combo].reduce((acc, digit) => acc ^ parseInt(digit), 0);
        console.log(`XOR: ${xor} (chr: ${String.fromCharCode(xor)})`);
    }
}

function checkTimestamp(num: string | number): string {
    const timestamp = Number(num);
    if (timestamp > 0) {
        try {
            const date = new Date(timestamp * 1000); // Convert to milliseconds
            // Check if it's a reasonable date (between 1970 and 2030)
            if (date.getFullYear() >= 1970 && date.getFullYear() <= 2030) {
                return `Possible Unix timestamp: ${date.toISOString()}`;
            }
        } catch {}
    }
    return '';
}

function analyzeTimestamps() {
    // Collect all our significant numbers
    const numbers = [
        "1901",             // Field + Method
        "19038",           // Field + GetType
        "190611",          // Field + StreamType
        "01038",           // Method + GetType
        "010611",          // Method + StreamType
        "1901038",         // Field + Method + GetType
        "19010611",        // Field + Method + StreamType
        "161",             // Version 1.6.1
        "1100",            // Version 1.10.0
        "038",             // GetType positions
        "0611",            // StreamType positions
        "19011611100",     // Field + Method + Versions
        "19010380611",     // Field + Method + Type positions
        "1611100380611"    // Versions + Type positions
    ];

    console.log('Analyzing potential Unix timestamps:');

    // Check each number as is
    for (const num of numbers) {
        console.log(`\nChecking number: ${num}`);
        const result = checkTimestamp(num);
        if (result) console.log(result);

        // Try reversing the number
        const reversed = [...num].reverse().join('');
        console.log(`Checking reversed: ${reversed}`);
        const reversedResult = checkTimestamp(reversed);
        if (reversedResult) console.log(reversedResult);

        // Try with different prefixes/suffixes that might make it a valid timestamp
        const variations = [
            `1${num}`,      // Add 1 prefix
            `${num}1`,      // Add 1 suffix
            `16${num}`,     // Add 16 prefix (from version)
            `${num}16`,     // Add 16 suffix
            `19${num}`,     // Add 19 prefix (from field pattern)
            `${num}19`,     // Add 19 suffix
        ];

        for (const variant of variations) {
            const variantResult = checkTimestamp(variant);
            if (variantResult) {
                console.log(`For variant ${variant}: ${variantResult}`);
            }
        }
    }

    // Try combining pairs of numbers
    console.log('\nChecking combinations:');
    for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
            const combined = numbers[i] + numbers[j];
            const result = checkTimestamp(combined);
            if (result) {
                console.log(`\nCombination ${numbers[i]} + ${numbers[j]}:`);
                console.log(result);
            }
        }
    }
}

function analyzeBase64Patterns() {
    const base64Patterns = [
        {
            original: "19010380611",
            base64: "MTkwMTAzODA2MTE=",
            description: "Field + Method + Type positions"
        },
        {
            original: "16111000380611",
            base64: "MTYxMTEwMDAzODA2MTE=",
            description: "Versions + Type positions"
        },
        {
            original: "19011611100",
            base64: "MTkwMTE2MTExMDA=",
            description: "Field + Method + Versions"
        }
    ];

    console.log('\nAnalyzing Base64 patterns in detail:');
    
    for (const pattern of base64Patterns) {
        console.log(`\nPattern: ${pattern.original}`);
        console.log(`Description: ${pattern.description}`);
        console.log(`Base64: ${pattern.base64}`);
        
        // Decode Base64 to hex
        const hex = Buffer.from(pattern.base64, 'base64').toString('hex');
        console.log(`Hex: ${hex}`);
        
        // Try to find ASCII characters
        const ascii = Buffer.from(pattern.base64, 'base64').toString('ascii');
        console.log(`ASCII: ${ascii}`);
        
        // Try to find UTF-8 characters
        const utf8 = Buffer.from(pattern.base64, 'base64').toString('utf8');
        console.log(`UTF-8: ${utf8}`);
        
        // Try to find UTF-16 characters
        const utf16 = Buffer.from(pattern.base64, 'base64').toString('utf16le');
        console.log(`UTF-16: ${utf16}`);
        
        // Try to find Latin1 characters
        const latin1 = Buffer.from(pattern.base64, 'base64').toString('latin1');
        console.log(`Latin1: ${latin1}`);
        
        // Try to find UCS2 characters
        const ucs2 = Buffer.from(pattern.base64, 'base64').toString('ucs2');
        console.log(`UCS2: ${ucs2}`);
        
        // Try to find UTF-8 without BOM
        const utf8NoBom = Buffer.from(pattern.base64, 'base64').toString('utf8').replace(/^\uFEFF/, '');
        console.log(`UTF-8 (no BOM): ${utf8NoBom}`);
        
        // Try to find UTF-16 without BOM
        const utf16NoBom = Buffer.from(pattern.base64, 'base64').toString('utf16le').replace(/^\uFEFF/, '');
        console.log(`UTF-16 (no BOM): ${utf16NoBom}`);
        
        // Try to find UTF-8 without BOM and without null bytes
        const utf8NoNull = Buffer.from(pattern.base64, 'base64').toString('utf8').replace(/^\uFEFF/, '').replace(/\0/g, '');
        console.log(`UTF-8 (no BOM, no null): ${utf8NoNull}`);
        
        // Try to find UTF-16 without BOM and without null bytes
        const utf16NoNull = Buffer.from(pattern.base64, 'base64').toString('utf16le').replace(/^\uFEFF/, '').replace(/\0/g, '');
        console.log(`UTF-16 (no BOM, no null): ${utf16NoNull}`);
        
        // Try to find UTF-8 without BOM and without null bytes and without control characters
        const utf8NoControl = Buffer.from(pattern.base64, 'base64').toString('utf8').replace(/^\uFEFF/, '').replace(/\0/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        console.log(`UTF-8 (no BOM, no null, no control): ${utf8NoControl}`);
        
        // Try to find UTF-16 without BOM and without null bytes and without control characters
        const utf16NoControl = Buffer.from(pattern.base64, 'base64').toString('utf16le').replace(/^\uFEFF/, '').replace(/\0/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        console.log(`UTF-16 (no BOM, no null, no control): ${utf16NoControl}`);
    }
}

console.log('Starting pattern analysis...');
analyzePatterns();

console.log('\nStarting specific pattern analysis...');
analyzeSpecificPatterns();

console.log('\nStarting final pattern analysis...');
analyzeFinalPatterns();

console.log('\nStarting timestamp analysis...');
analyzeTimestamps();

console.log('\nStarting Base64 pattern analysis...');
analyzeBase64Patterns(); 