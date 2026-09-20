sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
],
    function (JSONModel, Device) {
        "use strict";

        return {
            /**
             * Provides runtime info for the device the UI5 app is running on as JSONModel
             */
            createDeviceModel: function () {
                var oModel = new JSONModel(Device);
                oModel.setDefaultBindingMode("OneWay");
                return oModel;
            },

            appModel: function () {
                var sAppModel = {
                    "bRagChat": true,
                    "aChats": [],
                    "aFields": [],
                    "sSelMode": "context",
                    "sSessionId": "ef194f40-f5e0-4a58-8146-93492218bb1a",
                };
                var oModel = new JSONModel(sAppModel);
                oModel.setData(sAppModel);
                oModel.setDefaultBindingMode("TwoWay");
                return oModel;
            }
        };

    });