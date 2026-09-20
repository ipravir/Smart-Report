/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
        "sap/ui/core/UIComponent",
        "sap/ui/Device",
        "report/model/models",
        "report/model/ODataSrv",
    ],
    function (UIComponent, Device, models, ODataSrv) {
        "use strict";

        return UIComponent.extend("report.Component", {
            metadata: {
                manifest: "json"
            },

            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: async function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);

                // enable routing
                this.getRouter().initialize();

                // set the device model
                this.setModel(models.createDeviceModel(), "device");

                this.setModel(models.appModel(), "appModel");
                let sUserSessionId = await ODataSrv.getUserSessionId(this.getModel());
                this.getModel("appModel").setProperty("/sSessionId",sUserSessionId.Ragid);
            }
        });
    }
);