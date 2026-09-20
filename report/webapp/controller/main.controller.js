sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageBox",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "report/model/QuerySrv",
    "report/model/RAGQuery",
    "sap/ui/core/BusyIndicator",
    "sap/ui/core/ValueState",
    "sap/viz/ui5/format/ChartFormatter",
    "sap/viz/ui5/api/env/Format",
    "report/model/ODataSrv",
],
    function (Controller, MessageBox, JSONModel, Fragment, QuerySrv, RAGQuery, BusyIndicator, ValueState, ChartFormatter, Format, ODataSrv) {
        "use strict";

        return Controller.extend("report.controller.main", {
            onInit: function () {
                Format.numericFormatter(ChartFormatter.getInstance());
                var oVizFrame = this.byId("chartVizFrame");                
            },

            onBeforeRebindTable: function (oEvent) {
                const oBindingParams = oEvent.getParameter("bindingParams");
                this.getSmartTableAllColumnsMetadata(oEvent.getSource());
            },

            readSmartTableData: function () {
                const oSmartTable = this.byId("smartTableSalesOrders");
                if (!oSmartTable) {
                    return { fieldDescriptions: {}, rawRows: [], detailedRows: [] };
                }

                const oInnerTable = oSmartTable.getTable();
                const oModel = oSmartTable.getModel();
                const oMetaModel = oModel ? oModel.getMetaModel() : null;
                const sEntitySet = oSmartTable.getEntitySet();

                // 1. Get Field Descriptions (Labels) from Table Columns
                const mFieldLabels = {};

                if (oInnerTable && typeof oInnerTable.getColumns === "function") {
                    oInnerTable.getColumns().forEach(oColumn => {
                        let sFieldName = "";
                        let sLabelText = "";

                        // Read visible header text from column
                        const oHeader = oColumn.getHeader ? oColumn.getHeader() : oColumn.getLabel();
                        if (oHeader && typeof oHeader.getText === "function") {
                            sLabelText = oHeader.getText();
                        }

                        // Extract technical OData property name from SmartTable p13n custom data
                        const aCustomData = oColumn.getCustomData();
                        aCustomData.forEach(oCustomData => {
                            if (oCustomData.getKey() === "p13nData") {
                                const vValue = oCustomData.getValue();
                                const oP13n = typeof vValue === "string" ? JSON.parse(vValue) : vValue;
                                if (oP13n) {
                                    sFieldName = oP13n.leadingProperty || oP13n.columnKey;
                                }
                            }
                        });

                        if (sFieldName && sLabelText) {
                            mFieldLabels[sFieldName] = sLabelText;
                        }
                    });
                }

                // Fallback: Read missing labels directly from OData MetaModel metadata (sap:label)
                if (oMetaModel && sEntitySet) {
                    const oEntitySetMeta = oMetaModel.getODataEntitySet(sEntitySet);
                    if (oEntitySetMeta) {
                        const oEntityType = oMetaModel.getODataEntityType(oEntitySetMeta.entityType);
                        if (oEntityType && oEntityType.property) {
                            oEntityType.property.forEach(oProp => {
                                const sFieldName = oProp.name;
                                if (!mFieldLabels[sFieldName]) {
                                    mFieldLabels[sFieldName] = oProp["sap:label"] || sFieldName;
                                }
                            });
                        }
                    }
                }

                // 2. Read Raw Row Context Objects
                let aRawRows = [];
                if (oInnerTable.isA("sap.m.Table")) {
                    aRawRows = oInnerTable.getItems()
                        .map(oItem => oItem.getBindingContext())
                        .filter(Boolean)
                        .map(oContext => oContext.getObject());
                } else if (oInnerTable.isA("sap.ui.table.Table")) {
                    const oBinding = oInnerTable.getBinding("rows");
                    if (oBinding) {
                        aRawRows = oBinding.getContexts(0, oBinding.getLength())
                            .filter(Boolean)
                            .map(oContext => oContext.getObject());
                    }
                }

                // 3. Build Detailed Rows with Field Name, Description, and Value
                const aDetailedRows = aRawRows.map(oRow => {
                    const oRowDetails = {};

                    Object.keys(oRow).forEach(sFieldName => {
                        if (sFieldName !== "__metadata") {
                            oRowDetails[sFieldName] = {
                                label: mFieldLabels[sFieldName] || sFieldName,
                                value: oRow[sFieldName]
                            };
                        }
                    });

                    return oRowDetails;
                });

                return {
                    fieldDescriptions: mFieldLabels,
                    rawRows: aRawRows,              
                    detailedRows: aDetailedRows
                };
            },

            getHeaderValuePayload: function () {
                const oResult = this.readSmartTableData();
                const mFieldLabels = oResult.fieldDescriptions;
                const aRawRows = oResult.rawRows;

                const aHeaderValuePayload = aRawRows.map(oRow => {
                    const oHeaderRow = {};

                    Object.keys(oRow).forEach(sFieldName => {
                        // Exclude OData internal metadata key
                        if (sFieldName !== "__metadata") {
                            const sHeaderLabel = mFieldLabels[sFieldName] || sFieldName;
                            const vRawValue = oRow[sFieldName];

                            // Convert value to simple string format
                            oHeaderRow[sHeaderLabel] = this._formatFieldValueAsString(vRawValue);
                        }
                    });

                    return oHeaderRow;
                });
                return aHeaderValuePayload;
            },


            getSmartTableAllColumnsMetadata: function (oSmartTable) {
                // 1. Get EntitySet name from SmartTable
                var sEntitySet = oSmartTable.getEntitySet();
                if (!sEntitySet) {
                    console.warn("EntitySet is not defined on the SmartTable.");
                    return [];
                }

                // 2. Access OData MetaModel
                var oModel = oSmartTable.getModel();
                if (!oModel || !oModel.getMetaModel) {
                    console.warn("OData model or MetaModel not found.");
                    return [];
                }

                var oMetaModel = oModel.getMetaModel();

                // 3. Find EntitySet metadata definition
                var oEntitySetMeta = oMetaModel.getODataEntitySet(sEntitySet);
                if (!oEntitySetMeta) {
                    console.warn("EntitySet not found in metadata: " + sEntitySet);
                    return [];
                }

                // 4. Resolve EntityType metadata
                var oEntityTypeMeta = oMetaModel.getODataEntityType(oEntitySetMeta.entityType);
                if (!oEntityTypeMeta || !oEntityTypeMeta.property) {
                    return [];
                }

                // Helper: Map OData primitive types to official OpenSearch Field Data Types
                var fnMapToOpenSearchType = function (sEdmType, oProperty) {
                    switch (sEdmType) {
                        // String Types
                        case "Edm.String":
                            // If it's labeled as exact-match/id or has a filter restriction, map as keyword; otherwise text
                            return oProperty["sap:filter-restriction"] === "single-value" ? "keyword" : "text";
                        case "Edm.Guid":
                            return "keyword";

                        // Numeric Types
                        case "Edm.Int16":
                            return "short";
                        case "Edm.Int32":
                            return "integer";
                        case "Edm.Int64":
                            return "long";
                        case "Edm.Byte":
                        case "Edm.SByte":
                            return "byte";
                        case "Edm.Single":
                            return "float";
                        case "Edm.Double":
                            return "double";
                        case "Edm.Decimal":
                            return "double"; // Alternatively "scaled_float" depending on index setup

                        // Boolean Types
                        case "Edm.Boolean":
                            return "boolean";

                        // Date / Time Types
                        case "Edm.DateTime":
                        case "Edm.DateTimeOffset":
                        case "Edm.Time":
                            return "date";

                        // Binary Data
                        case "Edm.Binary":
                            return "binary";

                        // Default fallback
                        default:
                            return "text";
                    }
                };

                // 5. Map properties to OpenSearch Schema details
                var aColumns = oEntityTypeMeta.property.map(function (oProperty) {
                    // Resolve label: sap:label -> OData V4 Label annotation -> Fallback to Property Name
                    var sDescription = oProperty["sap:label"] ||
                        (oProperty["com.sap.vocabularies.Common.v1.Label"] && oProperty["com.sap.vocabularies.Common.v1.Label"].String) ||
                        oProperty.name;

                    return {
                        fieldName: oProperty.name,
                        fieldDescription: sDescription,
                        type: fnMapToOpenSearchType(oProperty.type, oProperty), // Official OpenSearch Type
                        odataType: oProperty.type // Original OData type kept for reference
                    };
                });

                return aColumns;
            },

            onCloseDialog: function (oEvent) {
                oEvent.getSource().getParent().close();
            },



            getSmartTableTypedData: function (oSmartTable, sRagUserField, sUserId) {
                if (!oSmartTable) {
                    console.warn("SmartTable reference is missing.");
                    return [];
                }

                // 1. Get metadata types for all entity fields
                var aColumnsMeta = this.getSmartTableAllColumnsMetadata(oSmartTable);
                var mTypeMap = {};
                aColumnsMeta.forEach(function (oCol) {
                    mTypeMap[oCol.fieldName] = oCol.type; // OpenSearch/OData type map
                });

                // 2. Get inner UI5 Table binding contexts
                var oInnerTable = oSmartTable.getTable();
                var oBinding = oInnerTable.getBinding("items") || oInnerTable.getBinding("rows");

                if (!oBinding) {
                    console.warn("No active binding found on the inner table.");
                    return [];
                }

                // 3. Extract contexts (handles filtered/sorted data)
                var aContexts = oBinding.getContexts(0, oBinding.getLength());

                // 4. Helper function to cast raw values based on metadata type
                var fnFormatValueByType = function (vRawValue, sType) {
                    if (vRawValue === null || vRawValue === undefined) {
                        return null;
                    }

                    switch (sType) {
                        case "integer":
                        case "short":
                        case "long":
                        case "byte":
                            return parseInt(vRawValue, 10);

                        case "double":
                        case "float":
                        case "decimal":
                            return parseFloat(vRawValue);

                        case "boolean":
                            return Boolean(vRawValue);

                        case "date":
                            if (vRawValue instanceof Date) {
                                return vRawValue.toISOString();
                            }
                            return new Date(vRawValue).toISOString();

                        case "keyword":
                        case "text":
                        default:
                            return String(vRawValue);
                    }
                };

                // 5. Map all rows into typed JSON objects
                var aFormattedData = aContexts.map(function (oContext) {
                    var oRowData = oContext.getObject();

                    // Inject default user ID field
                    var oFormattedRow = {
                        UserRagFld: sUserId
                    };

                    // Process each field present in metadata
                    Object.keys(mTypeMap).forEach(function (sFieldName) {
                        var vRawValue = oRowData[sFieldName];
                        var sFieldType = mTypeMap[sFieldName];

                        oFormattedRow[sFieldName] = fnFormatValueByType(vRawValue, sFieldType);
                    });

                    return oFormattedRow;
                });

                return aFormattedData;
            },

            onAIPress: function () {

                const oSmartTable = this.byId("smartTableSalesOrders");
                var aColumnsMeta = this.getDisplayingFields(oSmartTable);
                this.getView().getModel("appModel").setProperty("/aFields", aColumnsMeta);
                // this.loadTeampBotData();
                var oView = this.getView();
                if (!this._pFeedPopup) {
                    this._pFeedPopup = Fragment.load({
                        id: oView.getId(),
                        name: "report.fragments.RAGBot",
                        controller: this
                    }).then(function (oDialog) {
                        oView.addDependent(oDialog);
                        return oDialog;
                    });
                }

                // Open the dialog after ensuring it is loaded
                this._pFeedPopup.then(function (oDialog) {
                    oDialog.open();
                });
            },

            getDisplayingFields: function (oSmartTable) {
                var oInnerTable = oSmartTable.getTable();
                var oModel = oSmartTable.getModel();
                var oMetaModel = oModel ? oModel.getMetaModel() : null;
                var sEntitySet = oSmartTable.getEntitySet();
                var aColumns = oInnerTable.getColumns(); //
                var aDisplayedColumnsMeta = [];

                aColumns.forEach(function (oColumn) {
                    if (oColumn.getVisible()) {
                        var sLeadingProperty = "";
                        var sLabel = "";
                        var oData = oColumn.data("p13nData"); // Personalization data object
                        if (oData) {
                            sLeadingProperty = oData.leadingProperty || oData.columnKey;
                        }
                        if (!sLeadingProperty && oColumn.data("leadingProperty")) {
                            sLeadingProperty = oColumn.data("leadingProperty");
                        }
                        if (oMetaModel && sEntitySet && sLeadingProperty) {
                            var oPropertyMeta = oMetaModel.getODataProperty(
                                oMetaModel.getODataEntityType(oModel.getServiceMetadata().dataServices.schema[0].namespace + "." + sEntitySet),
                                sLeadingProperty
                            );
                            if (oPropertyMeta) {
                                sLabel = oPropertyMeta["sap:label"] || oPropertyMeta.name;
                            }
                        }
                        if (!sLabel) {
                            var oHeader = oColumn.getHeader ? oColumn.getHeader() : oColumn.getLabel();
                            sLabel = oHeader && oHeader.getText ? oHeader.getText() : "Unknown Column";
                        }
                        if (!sLeadingProperty) {
                            sLeadingProperty = oColumn.getId();
                        }

                        var fnMapToOpenSearchType = function (sEdmType) {
                            switch (sEdmType) {
                                // String Types
                                case "String":
                                    return "text";
                                case "Guid":
                                    return "keyword";

                                // Numeric Types
                                case "Int16":
                                    return "short";
                                case "Int32":
                                    return "integer";
                                case "Int64":
                                    return "long";
                                case "Byte":
                                case "SByte":
                                    return "byte";
                                case "Single":
                                    return "float";
                                case "Double":
                                    return "double";
                                case "Decimal":
                                    return "double"; // Alternatively "scaled_float" depending on index setup
                                // Boolean Types
                                case "Boolean":
                                    return "boolean";
                                // Date / Time Types
                                case "DateTime":
                                case "DateTimeOffset":
                                case "Time":
                                    return "date";
                                // Binary Data
                                case "Binary":
                                    return "binary";
                                // Default fallback
                                default:
                                    return "text";
                            }
                        };

                        aDisplayedColumnsMeta.push({
                            name: sLeadingProperty,
                            description: sLabel,
                        });
                    }
                });

                return aDisplayedColumnsMeta;
            },

            onModeSelect: function (oEvent) {
                const mModes = { 0: "context", 1: "array", 2: "chart", 3: "forecast", 4: "probability", 5: "timeseries" };
                this.getView().getModel("appModel").setProperty("/sSelMode", mModes[oEvent.getSource().getSelectedIndex()] || "context");

            },

            onPostFeedItem: async function (oEvent) {
                var aBOT_QUERY = this.getView().getModel("appModel").getProperty("/aChats");
                let oText = QuerySrv.createAITextLayout(oEvent.getSource().getValue(), "sap-icon://customer", "End");
                aBOT_QUERY.push({ "request": oEvent.getSource().getValue(), "response": "" });
                this.getView().byId("chatList").addItem(oText);
                this._setToBottom(oText);

                this.showBusy("Running on local Ollama")
                let sRagQueryResponse = await RAGQuery.processRAGQuery(this.getView().getModel("appModel").getProperty("/sSessionId"), oEvent.getSource().getValue());
                let oAiResponse = QuerySrv.createAIExtendedLayout(this.getView().byId("chatList"), sRagQueryResponse.answer, "sap-icon://ai", "Start", sRagQueryResponse.execution_data, sRagQueryResponse.execution_field);
                this.getView().byId("chatList").addItem(oAiResponse);
                this._setToBottom(oAiResponse);
                aBOT_QUERY.push({ "request": "", "response": sRagQueryResponse });

                this.hideBusy();
            },

            _setToBottom: function (oObject) {
                setTimeout(function () {
                    var oDomRef = oObject.getDomRef();
                    if (oDomRef) {
                        oDomRef.scrollIntoView({
                            behavior: "smooth",
                            block: "end"
                        });
                    }
                }, 50);
            },

            showBusy: function (sText) {
                if (sText) {
                    BusyIndicator.show(0, sText);
                } else {
                    BusyIndicator.show(0);
                }
            },
            hideBusy: function () {
                BusyIndicator.hide();
            },

            onDuckDBPress: async function () {
                this.showBusy();
                const sSessionId = this.getView().getModel("appModel").getProperty("/sSessionId");
                if (sSessionId !== "") {
                    await RAGQuery.deleteSession(sSessionId);
                }
                const sBody = await this.prepareReportSessionPayload("sales_orders_report");
                let sResponse = await RAGQuery.createRagSession(sBody);
                this.getView().getModel("appModel").setProperty("/sSessionId", sResponse.session_id);
                this.getView().getModel("appModel").setProperty("/bRagChat", true);
                await ODataSrv.insertUserSessionId(this.getView().getModel(), sResponse.session_id);
                this.hideBusy();
            },
            _mapEdmTypeToSqlType: function (sEdmType) {
                if (!sEdmType) {
                    return "STRING";
                }
                switch (sEdmType) {
                    case "Edm.Int16":
                        return "INTEGER";
                    case "Edm.Int32":
                        return "INTEGER";
                    case "Edm.Int64":
                        return "INTEGER";
                    case "Edm.SByte":
                        return "INTEGER";
                    case "Edm.Decimal":
                        return "FLOAT";
                    case "Edm.Double":
                        return "FLOAT";
                    case "Edm.Single":
                        return "FLOAT";
                    case "Edm.Float":
                        return "FLOAT";
                    case "Edm.Boolean":
                        return "BOOLEAN";
                    case "Edm.DateTime":
                        return "TIMESTAMP";
                    case "Edm.Time":
                        return "TIMESTAMP";
                    case "Edm.Date":
                        return "DATE";
                    default:
                        return "STRING";
                }
            },


            _getPropertySqlType: function (oMetaModel, sEntitySet, sProperty) {
                if (!oMetaModel || !sEntitySet || !sProperty) {
                    return "STRING";
                }
                try {
                    var oEntityType = oMetaModel.getODataEntityType(oMetaModel.getODataEntitySet(sEntitySet).entityType);
                    var oProperty = oMetaModel.getODataProperty(oEntityType, sProperty);

                    if (oProperty && oProperty.type) {
                        return this._mapEdmTypeToSqlType(oProperty.type);
                    }
                } catch (e) {
                    console.warn("Could not determine type for field: " + sProperty, e);
                }
                return "STRING";
            },


            _formatToStandardDateString: function (vValue) {
                if (!vValue) return null;

                var oDate = vValue;
                if (typeof vValue === "string" && vValue.indexOf("/Date(") !== -1) {
                    var iMilli = parseInt(vValue.replace(/\/Date\((-?\d+)\)\//, "$1"), 10);
                    oDate = new Date(iMilli);
                } else if (typeof vValue === "string") {
                    oDate = new Date(vValue);
                }

                if (oDate instanceof Date && !isNaN(oDate.getTime())) {
                    var sYear = oDate.getFullYear();
                    var sMonth = String(oDate.getMonth() + 1).padStart(2, "0");
                    var sDay = String(oDate.getDate()).padStart(2, "0");
                    return sYear + "-" + sMonth + "-" + sDay;
                }

                return vValue;
            },
            _getVisibleColumnMetadata: function (oSmartTable) {
                var oInnerTable = oSmartTable.getTable();
                var bIsResponsiveTable = oInnerTable.isA("sap.m.Table");
                var oModel = oSmartTable.getModel();
                var oMetaModel = oModel ? oModel.getMetaModel() : null;
                var sEntitySet = oSmartTable.getEntitySet();

                var aVisibleColumns = [];
                var aColumns = oInnerTable.getColumns();

                aColumns.forEach(function (oColumn) {
                    if (oColumn.getVisible()) {
                        var sBindingPath = "";
                        var sColumnHeader = "";

                        if (bIsResponsiveTable) {
                            sColumnHeader = oColumn.getHeader() ? oColumn.getHeader().getText() : "";
                            sBindingPath = oColumn.data("p13nData") ? oColumn.data("p13nData").leadingProperty : "";
                        } else {
                            sColumnHeader = oColumn.getLabel() ? oColumn.getLabel().getText() : "";
                            sBindingPath = oColumn.getLeadingProperty ? oColumn.getLeadingProperty() : "";
                        }

                        if (sBindingPath) {
                            var sSqlType = this._getPropertySqlType(oMetaModel, sEntitySet, sBindingPath);
                            aVisibleColumns.push({
                                path: sBindingPath,
                                header: sColumnHeader,
                                sqlType: sSqlType
                            });
                        }
                    }
                }.bind(this));

                return aVisibleColumns;
            },


            prepareReportSessionPayload: function (reportId) {
                var that = this;
                return new Promise(function (resolve, reject) {
                    var oSmartTable = that.byId("smartTableSalesOrders");
                    if (!oSmartTable) {
                        reject("SmartTable 'smartTableSalesOrders' not found.");
                        return;
                    }

                    var oInnerTable = oSmartTable.getTable();
                    var oBinding = oInnerTable.getBinding("items") || oInnerTable.getBinding("rows");

                    if (!oBinding) {
                        reject("Table binding not found.");
                        return;
                    }

                    var oModel = oSmartTable.getModel();
                    var sPath = oBinding.getPath();
                    var aFilters = oBinding.aApplicationFilters || oBinding.aFilters || [];
                    var aSorters = oBinding.aSorters || [];

                    // 1. Get visible columns & metadata types
                    var aVisibleColumns = that._getVisibleColumnMetadata(oSmartTable);
                    var aApiColumns = aVisibleColumns.map(function (col) {
                        return {
                            name: col.path,
                            data_type: col.sqlType,
                            description: col.header || col.path
                        };
                    });

                    // 2. Perform direct OData read for ALL matching records (no pagination/$top bounds)
                    oModel.read(sPath, {
                        filters: aFilters,
                        sorters: aSorters,
                        success: function (oData) {
                            var aRawResults = oData.results || [];
                            var aApiData = [];

                            // 3. Process records for visible columns only
                            aRawResults.forEach(function (oRowData) {
                                var oFilteredRow = {};

                                aVisibleColumns.forEach(function (col) {
                                    var vVal = oRowData[col.path];

                                    if (col.sqlType === "INTEGER" && vVal !== null && vVal !== undefined) {
                                        vVal = parseInt(vVal, 10);
                                    } else if (col.sqlType === "FLOAT" && vVal !== null && vVal !== undefined) {
                                        vVal = parseFloat(vVal);
                                    } else if ((col.sqlType === "TIMESTAMP" || col.sqlType === "DATE") && vVal) {
                                        vVal = that._formatToStandardDateString(vVal);
                                    }

                                    oFilteredRow[col.path] = (vVal !== undefined) ? vVal : null;
                                });

                                aApiData.push(oFilteredRow);
                            });

                            resolve({
                                report_id: reportId || "sales_orders_report",
                                columns: aApiColumns,
                                data: aApiData
                            });
                        },
                        error: function (oError) {
                            reject(oError);
                        }
                    });
                });
            },
        });
    });
