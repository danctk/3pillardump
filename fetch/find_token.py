def analyze_versions():
    # Version numbers from the files
    versions = [
        "1.6.1",    # protoc-gen-connect-es
        "1.10.0"    # protoc-gen-es
    ]
    
    # Convert version numbers to ASCII values
    for version in versions:
        parts = version.split('.')
        ascii_values = []
        for part in parts:
            ascii_values.extend([ord(c) for c in part])
        print(f"Version {version} as ASCII: {ascii_values}")
        
        # Try combining ASCII values
        combined = ''.join(chr(x) for x in ascii_values)
        print(f"Combined as string: {combined}")
        
        # Try XOR of ASCII values
        xor_result = 0
        for val in ascii_values:
            xor_result ^= val
        print(f"XOR result: {xor_result} (chr: {chr(xor_result)})")
        print()

def analyze_field_numbers():
    # Field numbers and types from protobuf definitions
    field_info = {
        'token': {'no': 1, 'type': 9},  # ScalarType.STRING
        'message': {'no': 1, 'type': 9}  # ScalarType.STRING
    }
    
    # Analyze patterns in field numbers and types
    for field, info in field_info.items():
        print(f"Field: {field}")
        print(f"Number: {info['no']}")
        print(f"Type: {info['type']}")
        
        # Try combining numbers
        combined = str(info['no']) + str(info['type'])
        print(f"Combined: {combined}")
        
        # Try ASCII interpretation
        ascii_val = info['no'] * info['type']
        if 32 <= ascii_val <= 126:  # Printable ASCII range
            print(f"ASCII value {ascii_val}: {chr(ascii_val)}")
        print()

def analyze_service_names():
    # Service and method names
    names = [
        "token.v1.TokenService",
        "GetToken",
        "StreamToken"
    ]
    
    # Look for patterns in the names
    for name in names:
        parts = name.split('.')
        for part in parts:
            # Count uppercase letters
            uppercase = sum(1 for c in part if c.isupper())
            print(f"Part: {part}, Uppercase count: {uppercase}")
            
            # Look at positions of uppercase letters
            positions = [i for i, c in enumerate(part) if c.isupper()]
            print(f"Uppercase positions: {positions}")
            
            # Try using positions as ASCII values
            if positions:
                try:
                    ascii_str = ''.join(chr(p) for p in positions)
                    print(f"Positions as ASCII: {ascii_str}")
                except:
                    pass
        print()

def analyze_method_kinds():
    # Method kinds from the TypeScript definition
    methods = {
        'getToken': 'MethodKind.Unary',
        'streamToken': 'MethodKind.ServerStreaming'
    }
    
    # Convert method kinds to numbers (Unary = 0, ServerStreaming = 1)
    kind_values = {
        'MethodKind.Unary': 0,
        'MethodKind.ServerStreaming': 1
    }
    
    # Analyze patterns in method kinds
    binary = ''
    for method, kind in methods.items():
        value = kind_values[kind]
        binary += str(value)
        print(f"Method: {method}, Kind: {kind}, Value: {value}")
    
    # Try interpreting binary as ASCII
    if len(binary) >= 8:
        try:
            ascii_val = int(binary[:8], 2)
            if 32 <= ascii_val <= 126:  # Printable ASCII range
                print(f"Binary {binary} as ASCII: {chr(ascii_val)}")
        except:
            pass
    print()

def analyze_type_patterns():
    # Look at type patterns in the declaration file
    types = [
        "GetTokenRequest",
        "GetTokenResponse",
        "StreamTokenRequest",
        "StreamTokenResponse"
    ]
    
    # Extract common patterns
    for i in range(len(types)):
        for j in range(i + 1, len(types)):
            type1 = types[i]
            type2 = types[j]
            # Find common substring
            common = ''
            for k in range(min(len(type1), len(type2))):
                if type1[k] == type2[k]:
                    common += type1[k]
                else:
                    break
            if common:
                print(f"Common pattern between {type1} and {type2}: {common}")
    print()

print("Analyzing version numbers...")
analyze_versions()

print("\nAnalyzing field numbers...")
analyze_field_numbers()

print("\nAnalyzing service names...")
analyze_service_names()

print("\nAnalyzing method kinds...")
analyze_method_kinds()

print("\nAnalyzing type patterns...")
analyze_type_patterns() 