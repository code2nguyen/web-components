# JSON Form

JSON Form is a web component uses JSON data to generate an input form and update provided data model

## Input

There are 3 inputs for `json-form` component.

### JSON (required):

A JSON Object uses to describe how to: - Generate form element - Validate form element

### Data (optional):

A Javascript object validated by Schema contains value for form elements

### Libs (optional):

A configuration for the lib of components which is used to generate form

### Example JSON Form

- Json

```json
{
  "isSameBillAddress": {
    "value": {
      "type": "boolean"
    },
    "ui": {
      "component": "checkbox",
      "attribute": {
        "label": "Use the same billing address"
      }
    }
  },
  "billingAddress": {
    "address": {
      "value": {
        "type": "string",
        "required": true
      },
      "ui": {
        "component": "textInput"
      }
    },
    "codePostal": {
      "value": {
        "type": "string",
        "required": true,
        "pattern": "[0-9]+",
        "maxLength": 5,
        "minLength": 5
      },
      "ui": {
        "enums": []
      }
    },
    "ui": {
      "component": "expansionPanel",
      "css": ["address-expansionPanel"],
      "attribute": {
        "open": false,
        "title": ""
      }
    }
  }
}
```

- Data

```json
{
  "isSameBillAddress": true,
  "billingAddress": {
    "address": "6 Rue Sotteville",
    "codePostal": "92160"
  }
}
```

### Meta-schema for Form Schema

```json
{
  "$id": "./meta-json-form",
  "$schema": "http://json-schema.org/draft-07/schema",
  "definitions": {
    "formGroupDefinition": {
      "patternProperties": {
        ".*": {
          "$ref": "#/definitions/uiDefinition"
        }
      },
      "properties": {
        "ui": {
          "$ref": "#/definitions/uiDefinition"
        },
        "uiOrder": {
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "type": "object"
    },
    "formItemDefinition": {
      "properties": {
        "additionalProperties": false,
        "ui": {
          "$ref": "#/definitions/uiDefinition"
        },
        "value": {
          "description": "Specifies value of form item. This value will be validated by json schema validation spec",
          "type": "object"
        }
      },
      "type": "object"
    },
    "uiDefinition": {
      "additionalProperties": false,
      "properties": {
        "attribute": {
          "type": "object"
        },
        "component": {
          "type": "string"
        },
        "css": {
          "items": {
            "type": "string"
          },
          "type": "array"
        }
      },
      "type": "object"
    }
  },
  "patternProperties": {
    ".*": {
      "anyOf": [
        {
          "$ref": "#/definitions/formItemDefinition"
        },
        {
          "$ref": "#/definitions/formGroupDefinition"
        }
      ]
    }
  },
  "type": "object"
}
```
