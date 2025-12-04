import json
import sys

def extract_all_keys(obj, keys_set):
    """Recursively extract all keys from nested dictionaries and lists"""
    if isinstance(obj, dict):
        # Add all keys from this dictionary
        keys_set.update(obj.keys())
        # Recursively process all values
        for value in obj.values():
            extract_all_keys(value, keys_set)
    elif isinstance(obj, list):
        # Process each item in the list
        for item in obj:
            extract_all_keys(item, keys_set)

def main():
    try:
        # Read the file
        with open('uw.coffee', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse as JSON
        data = json.loads(content)
        
        # Extract all unique keys
        all_keys = set()
        extract_all_keys(data, all_keys)
        
        # Sort keys alphabetically
        sorted_keys = sorted(all_keys)
        
        # Write to output file
        with open('uw_keys.txt', 'w', encoding='utf-8') as out:
            for key in sorted_keys:
                out.write(key + '\n')
        
        print(f"Extracted {len(sorted_keys)} unique keys")
        print(f"Keys written to uw_keys.txt")
        
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()






