sap.ui.define([
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
], function (Log, MessageBox, MessageToast) {
    "use strict";

    return {
        /**
         * Checks if an index exists on the local backend service
         * @param {string} sIndexName - Name of the index
         * @returns {Promise<object>} Resolves with backend response JSON
         */
        isIndexExists: async function (sIndexName, oModel) {
            const sUrl = `/OSServ/api/v1/index/${encodeURIComponent(sIndexName)}`;
            // Wrap in a Promise and return it so 'await' blocks execution properly
            return new Promise((resolve, reject) => {
                fetch(sUrl, {
                    // Includes session cookies so the server authenticates instead of redirecting
                    credentials: "same-origin"
                })
                    .then(response => response.json())
                    .then(data => {
                        resolve(data);
                    })
                    .catch(error => {
                        console.error("Failed to connect to local API:", error);
                        reject(error);
                    });
            });
        },

        reCreateIndex: async function (sIndexName) {
            MessageBox.confirm("Are you sure you want to Recreate? All users data will be deleted!", {
                title: "Confirm Deletion",
                actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
                emphasizedAction: MessageBox.Action.OK,
                initialFocus: MessageBox.Action.CANCEL,

                // 2. Handle the user's choice asynchronously
                onClose: async function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        // User clicked "OK" - Place your confirmation logic here
                        let oRef = await this._executeDeletion(sIndexName);
                        MessageToast.show(oRef.message);
                    } else {
                        // User clicked "CANCEL" or closed the dialog
                        MessageToast.show("Action canceled.");
                    }
                }.bind(this) // Use bind(this) to preserve the controller context inside the callback
            });
        },

        _executeDeletion: function (sIndexName) {
            const sUrl = `/OSServ/api/v1/index/${encodeURIComponent(sIndexName)}`;
            return new Promise((resolve, reject) => {
                fetch(sUrl, {
                    method: "DELETE",
                    credentials: "same-origin"
                })
                    .then(response => response.json())
                    .then(data => {
                        resolve(data);
                    })
                    .catch(error => {
                        console.error("Failed to connect to local API:", error);
                        reject(error);
                    });
            });
        },

        _prepareNewIndexBody: function (aFields, sIndexName) {
            // 1. Map the input array to the structure required by the API
            const mappedFields = aFields.map(item => ({
                name: item.fieldName,
                type: item.type,
                description: item.fieldDescription
            }));

            // 2. Define the mandatory user field that must go first
            const initialUserField = {
                name: "USER_RAG_FLDS",
                type: "text",
                description: "RAG User ID"
            };

            // 3. Assemble the final body structure, putting the user field at index 0
            return {
                index_name: sIndexName,
                fields: [initialUserField, ...mappedFields]
            };
        },

        creatNewIndex: async function (aFields, sIndexName) {
            const sUrl = `/OSServ/api/v1/index/create`;
            const sBody = this._prepareNewIndexBody(aFields, sIndexName);
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

        _prepareIndexData: function (aData, sIndexName) {
            return {
                index_name: sIndexName,
                documents: aData
            };
        },

        insertDataToIndex: async function (aData, sIndexName) {
            const sUrl = `/OSServ/api/v1/index/bulk-insert`;
            const sBody = this._prepareIndexData(aData, sIndexName);
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

        _prepareDeleteCondition: function (sIndexName, sUserId, sUserField) {
            return {
                index_name: sIndexName,
                logical_operator: "AND",
                conditions: [
                    {
                        field: sUserField,
                        condition_type: "equals",
                        value: sUserId
                    }
                ]
            };
        },
        deleteUserData: async function (sIndexName, sUserId, sUserField) {
            const sUrl = `/OSServ/api/v1/index/delete-by-condition`;
            const sBody = this._prepareDeleteCondition(sIndexName, sUserId, sUserField);
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
        }
    };
});