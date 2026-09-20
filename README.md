I’ve designed numerous processes, reports, and APIs. However, traditional development often ties solutions tightly to specific user requirements, which limits flexibility. My goal has always been to build **open, configurable solutions** where users can adjust behavior through settings rather than code changes.

A recurring challenge remains: How do we design systems that give users maximum flexibility in how they query and retrieve information from the backend?

With the emergence of **LLMs** and the **Model Context Protocol (MCP)**, this challenge is becoming easier to solve. By exposing SAP backend services through MCP, users can interact with SAP data using natural language, and the LLM can generate meaningful responses dynamically.

To explore this idea further, I experimented with enabling LLM‑based querying on report data — essentially creating a **Smart Report** concept. For testing, I used the SAP **VA05N** report, surfaced its data through a SAPUI5 application, and added intelligent features powered by LLMs. This approach demonstrates how traditional SAP reports can evolve into flexible, conversational, and insight‑driven tools.

The Architecture :

![](./Smart%20Report_images/image-001.png)

The Output :

![](./Smart%20Report_images/image-002.png)

**SAP Back-end Designed :**

Designed and implemented the **ZREPORT\_RAG** database table to persist user RAG session details, enabling comprehensive session logging and traceability. The solution also includes logic to identify and remove any existing active session before creating a new one, ensuring data consistency and preventing duplicate or stale session records.

![](./Smart%20Report_images/image-003.png)

Developed the class **ZCL\_REPORT\_CORE** to centralize the core processing logic for the application, including the primary methods **GET\_VA05N\_DATA**, **CREATE\_RAG**, and **GET\_RAG**. To retrieve the executed report output efficiently, the implementation leverages the standard SAP class **CL\_SALV\_BS\_RUNTIME\_INFO**, specifically its **GET\_DATA\_REF** method, enabling seamless access to ALV report data post‑execution. Additional handling was incorporated to manage data extraction, transformation, and preparation for downstream RAG generation within the application workflow.

Subsequently, an OData service **ZREPORTS** was developed using the SEGW transaction. Two entities were modeled: **raginfo**, backed by the **ZREPORT\_RAG** table, and **va05n**, based on the **SVBMTV\_TRVOG** structure.

The corresponding entity methods—**RAGINFOSET\_CREATE\_ENTITY**, **RAGINFOSET\_GET\_ENTITY**, and **VA05NSET\_GET\_ENTITYSET**—were redefined to integrate the core logic from **ZCL\_REPORT\_CORE**, invoking **CREATE\_RAG**, **GET\_RAG**, and **GET\_VA05N\_DATA** respectively. This enabled the creation and retrieval of RAG session logs as well as the delivery of VA05N report data to the SAPUI5 application.

![](./Smart%20Report_images/image-004.png)

**Ollama**

Deployed the **Ollama instance** inside a Docker container to ensure a clean, reproducible, and easily maintainable environment for local model experimentation.

After the deployment, installed a set of models tailored for coding assistance, general reasoning, and text‑embedding workflows:

-   **qwen2.5-coder:latest** — optimized for code generation, debugging, and developer‑focused tasks.
-   **llama3.1:latest** — a versatile general‑purpose model suitable for reasoning, drafting, and broader language tasks.
-   **nomic-embed-text:latest** — used for generating high‑quality text embeddings, ideal for semantic search, RAG pipelines, and similarity scoring.

Together, these models provide a balanced setup for development: strong coding support, reliable general LLM capabilities, and efficient embedding generation for retrieval‑augmented applications.

Report Analysis Api:

![](./Smart%20Report_images/image-005.png)

Developed a middleware api with following services:

/api/v1/report/session :

Used to store report data—both records and column definitions—into the **DuckDB** instance. DuckDB’s columnar storage and fast analytical capabilities make this endpoint ideal for capturing structured data that will later be queried, embedded, or analyzed using Ollama models.

/api/v1/report/session/all :

Fetches all currently available report sessions along with their associated metadata. This allows the system to quickly list active datasets stored in DuckDB.

/api/v1/report/session/{session\_id} :

Deletes a specific session using its unique session ID. Removing outdated or unnecessary sessions helps maintain a clean DuckDB environment and ensures that Ollama models operate only on relevant datasets during query generation or embedding workflows.

/api/v1/report/qa :

Processes a query against a selected session and returns a formatted, model‑generated response. This endpoint typically uses DuckDB to retrieve the relevant data and then leverages Ollama models—such as **qwen2.5‑coder**, **llama3.1**, or **nomic‑embed‑text**—to perform reasoning, generate answers, or produce embeddings for RAG‑style responses.

/api/v1/report/getForecast :

Generates forward‑looking time‑series predictions by retrieving historical date–value data based on passing into formated date and value details, and applying high‑performance forecasting models from the StatsForecast Python library. Once the endpoint extracts and prepares the dataset, it leverages **AutoARIMA** to automatically identify the optimal ARIMA configuration based on temporal patterns, and **AutoETS** to model trend and seasonality using exponential smoothing. These complementary models allow the system to produce accurate forecasts for the specified horizon, while DuckDB ensures fast analytical retrieval and preprocessing. The endpoint can also optionally pair the numerical output with an Ollama model to provide narrative explanations or contextual insights, creating a lightweight yet powerful forecasting workflow suitable for analytical reporting and decision support.

The Front-end:

Developed a SAPUI5 application by using the OData backend service and Report Analysis Middleware API.

On load, **RAGINFOSET\_GET\_ENTITY call to fetch latest generated user specific session details from SAP system and store into model variable.**

**Then on load of view, VA05NSET\_GET\_ENTITYSET service call to fetch all VA05N report data and display into smart table as below :**

![](./Smart%20Report_images/image-006.png)

The table toolbar provides two key options

1.  **Activate Smart Report** and
2.  **Chat**

that work together to enable AI‑driven analysis. When the user selects Activate Smart Report, the current table view, including all visible fields, is sent to DuckDB by triggering the /api/v1/report/session endpoint; before creating this new session, the system deletes any previously stored session for that user to prevent stale or outdated data from influencing query generation, ensure the AI always works with the latest table snapshot, and maintain a clean one‑session‑per‑user workflow. Once the new session is successfully stored in DuckDB, the **Chat** option becomes active, allowing the user to ask questions against the freshly loaded dataset and receive model‑generated responses based on the most current information.

The system shows the user’s request in the chat area in a clean, easy‑to‑read format, just like a normal messaging app :

![](./Smart%20Report_images/image-007.png)

Details available into back-end system (VA05N T-Code ):

![](./Smart%20Report_images/image-008.png)

Added a few more features related to the tabular data, as shown in the screen below.

![](./Smart%20Report_images/image-009.png)

At the top of any table‑based response, users can switch how the data is shown—either as a table or as an analytics view. For analytics, they can choose Bar, Line, Area, or Pie charts to better understand the information. These options are available only when the response contains tabular data.

![](./Smart%20Report_images/image-010.gif)

Added another feature specifically for Date‑and‑Value datasets that allows users to generate forecasts or time‑series projections for up to 10 future periods.

For example, in the scenario below, the system calculates the total net value based on the “created‑on” dates and then applies a forecast to generate the next five future periods.

![](./Smart%20Report_images/image-011.gif)

All program and logic details are available into :

This solution is built on an SAP EHP8 system and uses a local Ollama model, which is perfectly suitable for development, testing, and proving the overall concept. Moving to the SAP AI Core LLM service in the future can make responses faster, improve performance under heavy workloads, and provide better reliability as the application grows. The project also updates SAP ABAP syntax based on the system and kernel version, using newer and more efficient language features to improve runtime performance and maintainability.