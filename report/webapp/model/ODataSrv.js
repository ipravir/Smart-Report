sap.ui.define([
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
], function (Log, MessageBox, MessageToast) {
    "use strict";

    return {
        getUserSessionId: function (oModel) {
            let sPath = "/raginfoSet('SAPUSER')";
            return new Promise((resolve, reject) => {
                oModel.read(sPath, {
                    success: (oData, oResponse) => {
                        resolve(oData); // Resolve the promise with the backend payload
                    },
                    error: (oError) => {
                        reject(oError); // Reject the promise with the backend error
                    }
                });
            });
        },

        insertUserSessionId: function (oModel, sSessionId) {
            let sPayload = {
                Ragid: sSessionId,
                Bname: "SAPUSER"
            };
            let sPath = "/raginfoSet";
            return new Promise((resolve, reject) => {
                oModel.create(sPath, sPayload, {
                    success: (oCreatedEntry) => resolve(oCreatedEntry),
                    error: (oError) => reject(oError)
                });
            });
        }
    };
});