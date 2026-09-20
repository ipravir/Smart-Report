class ZCL_REPORT_CORE definition
  public
  final
  create public .

public section.

  types:
    typ_t_va05n TYPE STANDARD TABLE OF svbmtv_trvog .

  methods CONSTRUCTOR
    importing
      !IV_DATA type BOOLE_D .
  methods SUBMIT_REPORT
    importing
      !IV_REPORT_NAME type PROGRAM_ID .
  methods GET_REPORT_DATA
    returning
      value(RO_DATA) type ref to DATA .
  methods GET_VA05N_DATA
    exporting
      value(ET_DATA) type TYP_T_VA05N .
  methods GET_REPORT_FIELD
    importing
      !IV_STRUCTURE type TYPENAME
      !IV_TCODE type TCODE
    returning
      value(RT_FIELDS) type ZREPORT_FIELD_T .
  methods GET_REPORT_NAME
    importing
      !IV_TCODE type TCODE
    returning
      value(RV_REPORT_NAME) type PROGRAM_ID .
  methods GTE_REPORT_METADATA
    returning
      value(RT_META) type CL_SALV_BS_RUNTIME_INFO=>S_TYPE_METADATA .
  methods CREATE_RAG
    importing
      !IS_RAG type ZREPORT_RAG
    returning
      value(RS_RAG) type ZREPORT_RAG .
  methods GET_RAG
    importing
      !IV_BNAME type XUBNAME
    returning
      value(RS_RAG) type ZREPORT_RAG .
protected section.
private section.

  constants GV_VA05N type TCODE value 'VA05N' ##NO_TEXT.
ENDCLASS.



CLASS ZCL_REPORT_CORE IMPLEMENTATION.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->CONSTRUCTOR
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_DATA                        TYPE        BOOLE_D
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD constructor.
    IF iv_data EQ abap_true.
      cl_salv_bs_runtime_info=>set(
        EXPORTING
          display  = abap_false
          metadata = abap_true
          data     = abap_true ).
    ENDIF.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->CREATE_RAG
* +-------------------------------------------------------------------------------------------------+
* | [--->] IS_RAG                         TYPE        ZREPORT_RAG
* | [<-()] RS_RAG                         TYPE        ZREPORT_RAG
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD create_rag.
    rs_rag = is_rag.
    rs_rag-bname = sy-uname.
    rs_rag-datum = sy-datum.
    rs_rag-rtime = sy-uzeit.
    MODIFY zreport_rag FROM rs_rag.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GET_RAG
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_BNAME                       TYPE        XUBNAME
* | [<-()] RS_RAG                         TYPE        ZREPORT_RAG
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD get_rag.
    SELECT * FROM zreport_rag
             INTO TABLE @DATA(lt_rag)
             WHERE bname EQ @iv_bname.
    IF sy-subrc EQ 0.
      SORT lt_rag BY datum DESCENDING rtime DESCENDING.
      rs_rag = lt_rag[ 1 ].
    ENDIF.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GET_REPORT_DATA
* +-------------------------------------------------------------------------------------------------+
* | [<-()] RO_DATA                        TYPE REF TO DATA
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD get_report_data.
    TRY.
        cl_salv_bs_runtime_info=>get_data_ref(
          IMPORTING
            r_data = ro_data ).
      CATCH cx_salv_bs_sc_runtime_info.
    ENDTRY.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GET_REPORT_FIELD
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_STRUCTURE                   TYPE        TYPENAME
* | [--->] IV_TCODE                       TYPE        TCODE
* | [<-()] RT_FIELDS                      TYPE        ZREPORT_FIELD_T
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD get_report_field.
    DATA: lt_dfies_tab TYPE dfies_tab.
    CALL FUNCTION 'DDIF_FIELDINFO_GET'
      EXPORTING
        tabname        = iv_structure
      TABLES
        dfies_tab      = lt_dfies_tab
      EXCEPTIONS
        not_found      = 1
        internal_error = 2
        OTHERS         = 3.
    IF sy-subrc EQ 0.
      LOOP AT lt_dfies_tab INTO DATA(ls_fields).
        APPEND VALUE #( rponm = iv_tcode field = ls_fields-fieldname dscrp = ls_fields-scrtext_m ) TO rt_fields.
      ENDLOOP.
      DELETE rt_fields WHERE dscrp IS INITIAL.
    ENDIF.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GET_REPORT_NAME
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_TCODE                       TYPE        TCODE
* | [<-()] RV_REPORT_NAME                 TYPE        PROGRAM_ID
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD get_report_name.

    SELECT pgmna FROM tstc
                 UP TO 1 ROWS
                 INTO @rv_report_name
                 WHERE tcode EQ @iv_tcode.
    ENDSELECT.

  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GET_VA05N_DATA
* +-------------------------------------------------------------------------------------------------+
* | [<---] ET_DATA                        TYPE        TYP_T_VA05N
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD get_va05n_data.
    FIELD-SYMBOLS: <lt_va05n>   TYPE typ_t_va05n.
    FIELD-SYMBOLS  <fs_data> TYPE svbmtv_trvog.
    DATA ls_data TYPE svbmtv_trvog.
    submit_report( get_report_name( gv_va05n ) ).
    DATA(lo_data) = get_report_data( ).
    ASSIGN lo_data->* TO <lt_va05n>.
    IF <lt_va05n> IS ASSIGNED.
      DATA(lt_meta_fields) = gte_report_metadata( ).
      LOOP AT  <lt_va05n> ASSIGNING FIELD-SYMBOL(<fs_va05n>).
        ASSIGN ls_data TO <fs_data>.
        LOOP AT lt_meta_fields-t_fcat INTO DATA(ls_meta).
          ASSIGN COMPONENT ls_meta-fieldname OF STRUCTURE <fs_va05n> TO FIELD-SYMBOL(<fs_value>).
          IF <fs_value> IS ASSIGNED.
            ASSIGN COMPONENT ls_meta-fieldname OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<fs_val>).
            IF <fs_val> IS ASSIGNED.
              <fs_val> = <fs_value>.
            ENDIF.
          ENDIF.
        ENDLOOP.
        APPEND  <fs_data> TO et_data.
        UNASSIGN  <fs_data>.
      ENDLOOP.
    ENDIF.
    cl_salv_bs_runtime_info=>clear_all( ).
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->GTE_REPORT_METADATA
* +-------------------------------------------------------------------------------------------------+
* | [<-()] RT_META                        TYPE        CL_SALV_BS_RUNTIME_INFO=>S_TYPE_METADATA
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD gte_report_metadata.
    TRY.
        rt_meta = cl_salv_bs_runtime_info=>get_metadata( ).
      CATCH cx_salv_bs_sc_runtime_info.
    ENDTRY.
  ENDMETHOD.


* <SIGNATURE>---------------------------------------------------------------------------------------+
* | Instance Public Method ZCL_REPORT_CORE->SUBMIT_REPORT
* +-------------------------------------------------------------------------------------------------+
* | [--->] IV_REPORT_NAME                 TYPE        PROGRAM_ID
* +--------------------------------------------------------------------------------------</SIGNATURE>
  METHOD submit_report.
    DATA lt_r_date TYPE RANGE OF datum.
"     lt_r_date =  VALUE #( ( sign = 'I' option = 'BT' low = '20200101' high = '20201231' ) ).
    SUBMIT (iv_report_name)
    WITH saudat IN lt_r_date
    WITH   pvboff = abap_true
    WITH   pvball = abap_false
    AND RETURN.
  ENDMETHOD.
ENDCLASS.