## Application Details
|               |
| ------------- |
|**Generation Date and Time**<br>Sat Aug 29 2026 18:35:28 GMT+0200 (Central European Summer Time)|
|**App Generator**<br>@sap/generator-fiori-freestyle|
|**App Generator Version**<br>1.15.3|
|**Generation Platform**<br>Visual Studio Code|
|**Template Used**<br>simple|
|**Service Type**<br>SAP System (ABAP On Premise)|
|**Service URL**<br>http://eccehp8.erp.com:8055/sap/opu/odata/sap/ZREPORTS_SRV|
|**Module Name**<br>report|
|**Application Title**<br>Report|
|**Namespace**<br>|
|**UI5 Theme**<br>sap_horizon|
|**UI5 Version**<br>1.151.0|
|**Enable Code Assist Libraries**<br>False|
|**Enable TypeScript**<br>False|
|**Add Eslint configuration**<br>False|

## report

An SAP Fiori application.

### Starting the generated app

-   This app has been generated using the SAP Fiori tools - App Generator, as part of the SAP Fiori tools suite.  In order to launch the generated app, simply run the following from the generated app root folder:

```
    npm start
```

- It is also possible to run the application using mock data that reflects the OData Service URL supplied during application generation.  In order to run the application with Mock Data, run the following from the generated app root folder:

```
    npm run start-mock
```

#### Pre-requisites:

1. Active NodeJS LTS (Long Term Support) version and associated supported NPM version.  (See https://nodejs.org)




RAGPro
RAG_ARRAY_API
RAG_CONTEXT_API




===========
Step 1: Pull the Embedding Model in Ollama

docker exec -it ollama ollama pull nomic-embed-text


Step 2: Enable ML Commons Remote Connectors in OpenSearch
PUT /_cluster/settings
{
  "persistent": {
    "plugins.ml_commons.only_run_on_ml_node": "false",
    "plugins.ml_commons.allow_registering_model_via_url": "true",
    "plugins.ml_commons.trusted_connector_endpoints_regex": [
      "^https?://.*$"
    ],
    "plugins.ml_commons.connector.private_ip_enabled": "true"
  }
}


Step 3  :   Create an OpenSearch Connector to Ollama

POST /_plugins/_ml/connectors/_create
{
  "name": "Ollama Nomic Embeddings Connector",
  "description": "Remote connector for Ollama nomic-embed-text model",
  "version": "1",
  "protocol": "http",
  "credential": {
    "key": "none"
  },
  "parameters": {
    "endpoint": "ollama:11434",
    "model": "nomic-embed-text"
  },
  "actions": [
    {
      "action_type": "predict",
      "method": "POST",
      "url": "http://${parameters.endpoint}/api/embed",
      "request_body": "{ \"model\": \"${parameters.model}\", \"input\": \"${parameters.texts}\" }",
      "pre_process_function": "connector.pre_process.default.embedding",
      "post_process_function": "connector.post_process.default.embedding"
    }
  ]
}

reponse 
{
  "connector_id": "bIHyoKABQ8HfuLGquJdW"
}

Step 4: Register and Deploy the Remote Model
Link the connector to an OpenSearch ML Model ID and deploy it.
Register Model:
POST /_plugins/_ml/models/_register?deploy=true
{
  "name": "Ollama Embedding Model",
  "function_name": "remote",
  "description": "Remote embedding model served by local Ollama container",
  "connector_id": "bIHyoKABQ8HfuLGquJdW"
}

Response    
{
  "task_id": "eIHzoKABQ8HfuLGqzpeD",
  "status": "CREATED",
  "model_id": "eYHzoKABQ8HfuLGqzpe3"
}

Check Deployment Status:
GET /_plugins/_ml/models/eYHzoKABQ8HfuLGqzpe3


Step 5: Create an Ingest Pipeline for Auto-Embedding
Set up an Ingest Pipeline using a text_embedding processor. This converts plain text fields into vector embeddings automatically upon indexing:

PUT /_ingest/pipeline/ollama_embedding_pipeline
{
  "description": "Text embedding pipeline using Ollama",
  "processors": [
    {
      "text_embedding": {
        "model_id": "eYHzoKABQ8HfuLGqzpe3",
        "field_map": {
          "passage_text": "passage_embedding"
        }
      }
    }
  ]
}

Step 6: Create the Vector Index (k-NN)Create a target index configured with vector search capabilities (index.knn: true). Ensure dimension matches your embedding model's output size (768 for nomic-embed-text, 1024 for mxbai-embed-large).
PUT /semantic-search-index
{
  "settings": {
    "index.knn": true,
    "default_pipeline": "ollama_embedding_pipeline"
  },
  "mappings": {
    "properties": {
      "passage_text": {
        "type": "text"
      },
      "passage_embedding": {
        "type": "knn_vector",
        "dimension": 768,
        "method": {
          "name": "hnsw",
          "space_type": "l2",
          "engine": "faiss"
        }
      }
    }
  }
}