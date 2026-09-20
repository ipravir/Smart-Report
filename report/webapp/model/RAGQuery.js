sap.ui.define([
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
], function (Log, MessageBox, MessageToast) {
    "use strict";

    return {

        createRagSession: async function (sBody) {
            const sUrl = `/DuckDBSrv/api/v1/report/session`;
            return new Promise((resolve, reject) => {
                fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json" // Informs the server it is receiving JSON data
                    },
                    credentials: "same-origin", // Includes session cookies for authentication
                    body: JSON.stringify(sBody) // Converts the JavaScript object into a JSON string
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        resolve(data);
                    })
                    .catch(error => {
                        console.error("Failed to connect to local API:", error);
                        reject(error);
                    });
            });
        },

        processRAGQuery: async function (sSessionId, sQuery) {
            const sUrl = `/DuckDBSrv/api/v1/report/qa`;
            const sBody = this._prepareRAGQueryBody(sSessionId, sQuery);
            return new Promise((resolve, reject) => {
                fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json" // Informs the server it is receiving JSON data
                    },
                    credentials: "same-origin", // Includes session cookies for authentication
                    body: JSON.stringify(sBody) // Converts the JavaScript object into a JSON string
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        resolve(data);
                    })
                    .catch(error => {
                        console.error("Failed to connect to local API:", error);
                        reject(error);
                    });
            });
        },

        _prepareRAGQueryBody: function (sSessionId, sQuery) {
            return {
                "session_id": sSessionId,
                "query": sQuery
            }

        },

        deleteSession: async function (sSessionId) {
            try {
                const sUrl = `/DuckDBSrv/api/v1/report/session/${sSessionId}`;
                return new Promise((resolve, reject) => {
                    fetch(sUrl, {
                        method: "DELETE",
                        headers: {
                            "Content-Type": "application/json" // Informs the server it is receiving JSON data
                        },
                        credentials: "same-origin", // Includes session cookies for authentication
                    })
                        .then(response => {
                            if (!response.ok) {
                                return response.statusText;
                            }
                            return response.json();
                        })
                        .then(data => {
                            resolve(data);
                        })
                        .catch(error => {
                            reject(error);
                        });
                });
            } catch (error) {
                console.error("Failed to delete session:", error);
                return;
            }
        },

        getForcasrt: async function (sBody) {
            try {
                const sUrl = `/DuckDBSrv/api/v1/report/getForecast`;
                return new Promise((resolve, reject) => {
                    fetch(sUrl, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json" // Informs the server it is receiving JSON data
                        },
                        credentials: "same-origin", // Includes session cookies for authentication
                        body: sBody
                    })
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`HTTP error! status: ${response.status}`);
                            }
                            return response.json();
                        })
                        .then(data => {
                            resolve(data);
                        })
                        .catch(error => {
                            console.error("Failed to connect to local API:", error);
                            reject(error);
                        });
                });
            } catch (error) {
                console.error("Failed to get forecast:", error);
                return;
            }
        },


        processQuery: async function (sIndexName, sQuery, sRagUserId, aFields, sMode) {

            const sContextUrl = `/RagContxtServ/v1/rag/query`;
            const sTArrayUrl = `/RagTableServ/api/v1/rag/query`;
            var sUrl = "";

            switch (sMode) {
                case "context":
                    sUrl = sContextUrl;
                    // Handle default mode
                    break;
                case "array":
                    sUrl = sTArrayUrl;
                    // Handle advanced mode
                    break;
                case "chart":
                    sUrl = sTArrayUrl;
                    break;
                default:
                    Log.error("Unknown mode specified for RAG query");
            }

            const sBody = this._prepareQuery(sIndexName, sQuery, sRagUserId, aFields, sMode);
            return new Promise((resolve, reject) => {
                fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json" // Informs the server it is receiving JSON data
                    },
                    credentials: "same-origin", // Includes session cookies for authentication
                    body: JSON.stringify(sBody) // Converts the JavaScript object into a JSON string
                })
                    .then(response => {
                        // Optional: Handle non-2xx network errors explicitly
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        resolve(data);
                    })
                    .catch(error => {
                        console.error("Failed to connect to local API:", error);
                        reject(error);
                    });
            });
        },

        _prepareQuery: function (sIndexName, sQuery, sRagUserId, aFields, sMode) {
            return {
                index_name: sIndexName,
                query: sQuery,
                rag_user_id: sRagUserId,
                top_k: 5,
                fields: aFields,
                mode: sMode,
                "ollama_hug": "ollama"
            }
        }
    };
});