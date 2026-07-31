Option Explicit

' Vive en GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm, junto a ActualizarFechas.
' Lee de la hoja "Programa_Maq". Para quitar o agregar un trabajo, borra/inserta
' la FILA COMPLETA (clic derecho sobre el número de fila) — si en cambio borras
' el contenido de una fila y escribes un trabajo nuevo encima, la columna AA no
' se limpia sola y el ID (con su marca TRA/TER) queda pegado al trabajo nuevo.

Sub ExportarProgramacionJSON()
    Const COL_ID_UNICO As Integer = 27 ' columna AA

    Dim ws As Worksheet
    Dim rutaProyecto As String, rutaJSON As String
    Dim lastRow As Long, r As Long
    Dim maquinaActual As String, contador As Long
    Dim cerrada As Boolean
    Dim filas As String, json As String
    Dim version As Long
    Dim primeraFila As Boolean
    Dim hojaActiva As Worksheet

    Set hojaActiva = ActiveSheet
    Application.ScreenUpdating = False

    ' ===== AJUSTA SOLO ESTA LÍNEA SI MUEVES LA CARPETA DEL PROYECTO =====
    rutaProyecto = "C:\progplantaglobal.vercel.app\"
    ' ======================================================================

    rutaJSON = rutaProyecto & "public\data\programacion.json"

    Set ws = ThisWorkbook.Sheets("Programa_Maq")

    version = SiguienteVersion()
    hojaActiva.Activate
    Application.ScreenUpdating = True

    lastRow = ws.Cells(ws.Rows.Count, "J").End(xlUp).Row

    Dim columnas(1 To 22) As String
    columnas(1) = "ID": columnas(2) = "Maquina": columnas(3) = "OP": columnas(4) = "REF"
    columnas(5) = "LINEA": columnas(6) = "ACAB": columnas(7) = "COLOR": columnas(8) = "DESTINO"
    columnas(9) = "NOTAS": columnas(10) = "LAM": columnas(11) = "POR_PRODUCIR": columnas(12) = "PEDIDO_CLIENTE"
    columnas(13) = "TIEMPO_MONTAJE": columnas(14) = "VELOCIDAD": columnas(15) = "HORAS_MAQUINADO"
    columnas(16) = "TIEMPO_MAQUINADO": columnas(17) = "FECHA_RODAJA": columnas(18) = "INICIA_MAQUINADO"
    columnas(19) = "TERMINA_MAQUINADO": columnas(20) = "FECHA_DESPACHO": columnas(21) = "RODAJA"
    columnas(22) = "MONTAJE_AFUERA"

    Dim colJSON As String, i As Integer
    For i = 1 To 22
        colJSON = colJSON & """" & columnas(i) & """"
        If i < 22 Then colJSON = colJSON & ","
    Next i

    filas = "": maquinaActual = "SIN_MAQUINA": contador = 0: cerrada = False: primeraFila = True
    Application.ScreenUpdating = False

    For r = 5 To lastRow
        Dim colA As String, colJ As String
        Dim hayContenido As Boolean
        Dim cc As Integer

        colA = Trim(CStr(ws.Cells(r, "A").Value))
        colJ = UCase(Trim(CStr(ws.Cells(r, "J").Value)))

        hayContenido = False
        For cc = 1 To 14
            If Trim(CStr(ws.Cells(r, cc).Value)) <> "" Then
                hayContenido = True
                Exit For
            End If
        Next cc

        If Not hayContenido Then
            ' fila vacía -> ignorar

        ElseIf colA <> "" And Not IsNumeric(colA) And InStr(colJ, "DIA") = 0 Then
            maquinaActual = colA
            contador = 0
            cerrada = False

        ElseIf InStr(colJ, "DIA") > 0 Then
            cerrada = True ' subtotal -> no acepta más filas hasta el próximo encabezado

        ElseIf Not cerrada Then
            contador = contador + 1
            Dim idFila As String, celdaID As Range
            Set celdaID = ws.Cells(r, COL_ID_UNICO)
            If Trim(CStr(celdaID.Value)) = "" Then
                idFila = LimpiarID(maquinaActual) & "_" & Format(SiguienteIDUnico(), "00000")
                celdaID.Value = idFila
            Else
                idFila = Trim(CStr(celdaID.Value))
            End If

            If Not primeraFila Then filas = filas & ","
            primeraFila = False

            filas = filas & "[" & JStr(idFila) & "," & JStr(maquinaActual) & "," & _
                JVal(ws.Cells(r, 1)) & "," & JVal(ws.Cells(r, 2)) & "," & JVal(ws.Cells(r, 3)) & "," & _
                JVal(ws.Cells(r, 4)) & "," & JVal(ws.Cells(r, 5)) & "," & JVal(ws.Cells(r, 6)) & "," & _
                JVal(ws.Cells(r, 7)) & "," & JVal(ws.Cells(r, 8)) & "," & JVal(ws.Cells(r, 9)) & "," & _
                JVal(ws.Cells(r, 10)) & "," & JVal(ws.Cells(r, 11)) & "," & JVal(ws.Cells(r, 12)) & "," & _
                JVal(ws.Cells(r, 13)) & "," & JVal(ws.Cells(r, 14)) & "," & JVal(ws.Cells(r, 15)) & "," & _
                JVal(ws.Cells(r, 16)) & "," & JVal(ws.Cells(r, 17)) & "," & JVal(ws.Cells(r, 18)) & "," & _
                JVal(ws.Cells(r, 19)) & "," & JVal(ws.Cells(r, 20)) & "]"
        End If
    Next r

    Application.ScreenUpdating = True
    ThisWorkbook.Save

    Dim observaciones As String
    observaciones = Trim(CStr(ws.Cells(3, "A").Value))

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""observaciones"":" & JStr(observaciones) & ",""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"

    GuardarUTF8SinBOM rutaJSON, json

    Dim resultado As String
    resultado = PublicarEnGitHub(rutaProyecto, version)

    MsgBox "Kiosko actualizado." & vbCrLf & "Versión: " & version & vbCrLf & resultado, _
        vbInformation, "Kiosko Producción"
End Sub

Private Function SiguienteVersion() As Long
    Const NOMBRE_HOJA As String = "KioskoConfig"
    Dim wsConfig As Worksheet

    On Error Resume Next
    Set wsConfig = ThisWorkbook.Sheets(NOMBRE_HOJA)
    On Error GoTo 0

    If wsConfig Is Nothing Then
        Set wsConfig = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        wsConfig.Name = NOMBRE_HOJA
        wsConfig.Visible = xlSheetVeryHidden
        wsConfig.Range("A1").Value = 0
    End If

    wsConfig.Range("A1").Value = wsConfig.Range("A1").Value + 1
    SiguienteVersion = wsConfig.Range("A1").Value
End Function

Private Function SiguienteIDUnico() As Long
    Const NOMBRE_HOJA As String = "KioskoConfig"
    Dim wsConfig As Worksheet

    On Error Resume Next
    Set wsConfig = ThisWorkbook.Sheets(NOMBRE_HOJA)
    On Error GoTo 0

    If wsConfig Is Nothing Then
        Set wsConfig = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.Count))
        wsConfig.Name = NOMBRE_HOJA
        wsConfig.Visible = xlSheetVeryHidden
        wsConfig.Range("A1").Value = 0
    End If

    If Trim(CStr(wsConfig.Range("B1").Value)) = "" Then wsConfig.Range("B1").Value = 0
    wsConfig.Range("B1").Value = wsConfig.Range("B1").Value + 1
    SiguienteIDUnico = wsConfig.Range("B1").Value
End Function

Private Function LimpiarID(texto As String) As String
    Dim t As String
    t = UCase(Trim(texto))
    t = Replace(t, " ", ""): t = Replace(t, "/", ""): t = Replace(t, "-", ""): t = Replace(t, Chr(10), "")
    If Len(t) > 12 Then t = Left(t, 12)
    LimpiarID = t
End Function

Private Function JVal(c As Range) As String
    ' IsNumeric(c.Value) solo no alcanza: da True para texto tipo REF="0188",
    ' y exportarlo como número rompe el cero a la izquierda. Por eso se mira
    ' VarType, no solo si el contenido parece número.
    If IsEmpty(c.Value) Then
        JVal = "null"
    ElseIf IsDate(c.Value) Then
        JVal = """" & Format(c.Value, "yyyy-mm-dd hh:mm") & """"
    ElseIf IsNumeric(c.Value) And VarType(c.Value) <> vbString Then
        JVal = Replace(CStr(c.Value), ",", ".")
    Else
        JVal = """" & EscaparJSON(CStr(c.Value)) & """"
    End If
End Function

Private Function JStr(texto As String) As String
    JStr = """" & EscaparJSON(texto) & """"
End Function

Private Function EscaparJSON(texto As String) As String
    Dim t As String
    t = Replace(texto, "\", "\\")
    t = Replace(t, """", "\""")
    t = Replace(t, Chr(13), "\r")
    t = Replace(t, Chr(10), "\n")
    EscaparJSON = t
End Function

Private Sub GuardarUTF8SinBOM(ruta As String, contenido As String)
    ' ADODB.Stream con Charset="utf-8" añade un BOM de 3 bytes; se descarta
    ' releyendo en binario desde la posición 3.
    Dim txtStream As Object, binStream As Object
    Dim bytes() As Byte

    Set txtStream = CreateObject("ADODB.Stream")
    txtStream.Type = 2
    txtStream.Charset = "utf-8"
    txtStream.Open
    txtStream.WriteText contenido
    txtStream.Position = 0
    txtStream.Type = 1
    txtStream.Position = 3
    bytes = txtStream.Read
    txtStream.Close

    Set binStream = CreateObject("ADODB.Stream")
    binStream.Type = 1
    binStream.Open
    binStream.Write bytes
    binStream.SaveToFile ruta, 2
    binStream.Close
End Sub

Private Function PublicarEnGitHub(ruta As String, version As Long) As String
    Dim wsh As Object
    Set wsh = CreateObject("WScript.Shell")
    Dim cmd As String
    cmd = "cmd /c cd /d """ & ruta & """ && git add public\data\programacion.json && " & _
          "git commit -m ""Actualizacion automatica v" & version & """ && git push origin main"
    Dim ret As Long
    ret = wsh.Run(cmd, 0, True)
    If ret = 0 Then
        PublicarEnGitHub = "GitHub: publicado. Vercel iniciará el despliegue en unos segundos."
    Else
        PublicarEnGitHub = "AVISO: git devolvió código " & ret & ". Revisa manualmente 'git status' " & _
            "en la carpeta (puede ser que no hubiera cambios, o falten credenciales de push configuradas)."
    End If
End Function
