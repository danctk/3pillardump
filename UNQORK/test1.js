<div id="swagger-ui"></div>

<!-- Swagger UI CSS -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist/swagger-ui.css">

<script ng-if="data.runJs === 'yes'">
    console.log("Adding Swagger UI scripts dynamically...");
    angular.element('.unqorkio-form').scope().submission.data.runJs = 'no';
    
    // Function to dynamically load scripts and initialize Swagger
    function loadSwaggerUI() {
        // Load Swagger UI scripts
        const scriptBundle = document.createElement("script");
        scriptBundle.src = "https://cdn.jsdelivr.net/npm/swagger-ui-dist/swagger-ui-bundle.js";
        scriptBundle.onload = function () {
            console.log("SwaggerUIBundle loaded.");

            const scriptPreset = document.createElement("script");
            scriptPreset.src = "https://cdn.jsdelivr.net/npm/swagger-ui-dist/swagger-ui-standalone-preset.js";
            scriptPreset.onload = function () {
                console.log("SwaggerUIStandalonePreset loaded.");

                // Load js-yaml for YAML conversion
                const scriptYaml = document.createElement("script");
                scriptYaml.src = "https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js";
                scriptYaml.onload = function () {
                    console.log("js-yaml loaded.");

                    // Reference to your swaggerData object
                    const swaggerDataString = angular.element('.unqorkio-form').scope().submission.data.swaggerData;

                    // Log the raw swaggerData string
                    console.log("Raw swaggerData string:", swaggerDataString);

                    // Parse the stringified swaggerData
                    let swaggerData;
                    try {
                        swaggerData = JSON.parse(swaggerDataString);
                        console.log("Parsed swaggerData:", swaggerData);  // Log parsed swaggerData
                    } catch (error) {
                        console.error("Failed to parse swaggerData:", error);
                        return;
                    }

                    // Function to parse required fields and set valid HTTP methods
                    function parseSwaggerData(data) {
                        if (data.paths) {
                            for (const path in data.paths) {
                                const operations = data.paths[path];

                                // Change the empty operation key to 'post' (or any valid method you need)
                                if (operations['']) {
                                    operations.post = operations['']; // Move existing data from the empty key to 'post'
                                    delete operations['']; // Remove the empty key
                                }

                                for (const method in operations) {
                                    const operation = operations[method];

                                    // Parse requestBody required fields
                                    if (operation.requestBody && operation.requestBody.content) {
                                        for (const contentType in operation.requestBody.content) {
                                            const schema = operation.requestBody.content[contentType].schema;

                                            if (schema.properties) {
                                                for (const prop in schema.properties) {
                                                    const property = schema.properties[prop];
                                                    // Convert string "true"/"false" to boolean
                                                    if (typeof property.required === 'string') {
                                                        property.required = property.required.toLowerCase() === "true"; // Convert
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // Parse response properties if necessary
                                    if (operation.responses) {
                                        for (const responseCode in operation.responses) {
                                            const response = operation.responses[responseCode];
                                            if (response.content) {
                                                for (const contentType in response.content) {
                                                    const schema = response.content[contentType].schema;
                                                    if (schema.properties) {
                                                        for (const prop in schema.properties) {
                                                            const property = schema.properties[prop];
                                                            // Convert string "true"/"false" to boolean
                                                            if (typeof property.required === 'string') {
                                                                property.required = property.required.toLowerCase() === "true"; // Convert
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        return data;
                    }

                    // Parse swaggerData to ensure boolean values and valid methods
                    const parsedSwaggerData = parseSwaggerData(swaggerData);

                    // Log the fully parsed specs for troubleshooting
                    console.log("Fully Parsed Swagger Spec:", JSON.stringify(parsedSwaggerData, null, 2));

                    // Convert parsed JSON to YAML and log it
                    const yamlString = jsyaml.dump(parsedSwaggerData);
                    console.log("YAML Representation of Parsed Swagger Spec:", yamlString);

                    // Check if swaggerData is defined
                    if (!parsedSwaggerData) {
                        console.error("Parsed swaggerData is not defined.");
                        return;
                    }

                    // Initialize Swagger UI
                    SwaggerUIBundle({
                        spec: parsedSwaggerData,  // Use the parsed swaggerData as the spec
                        dom_id: '#swagger-ui',
                        presets: [SwaggerUIStandalonePreset, SwaggerUIBundle.presets.apis],
                        layout: "StandaloneLayout",
                    });

                    console.log("Swagger UI initialized successfully");
                };

                document.body.appendChild(scriptYaml);
            };

            document.body.appendChild(scriptPreset);
        };

        document.body.appendChild(scriptBundle);
    }

    // Call the function to load Swagger UI scripts and initialize
    loadSwaggerUI();
</script>
