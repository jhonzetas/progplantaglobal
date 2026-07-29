Option Explicit

' Vive en GESTION DE PRODUCCION PLANTA GLOBAL_1.xlsm, junto a ActualizarFechas.
' Lee directo de la hoja "Programa_Maq" (la fuente real que actualizas a diario),
' NO del archivo IMPRIMIBLE MAQUINADO.xlsx — así no depende de un paso manual
' de copiado aparte.
'
' La clasificación de fila (vacía / encabezado de máquina / subtotal / fila
' productiva) replica EXACTAMENTE la de ActualizarFechas (Módulo6), incluyendo
' que una fila productiva puede tener la columna OP vacía si hay datos en otras
' columnas — ActualizarFechas ya trata esas filas como válidas y este macro
' debía hacer lo mismo. La única regla nueva que agrega este macro (no está en
' ActualizarFechas) es el corte en el subtotal: una vez visto el subtotal de una
' máquina, no vuelve a aceptar filas hasta el siguiente encabezado de máquina —
' protección contra bloques duplicados pegados por error (así se detectó y
' limpió el caso de DMK 7 LASER).
'
' INTEGRACIÓN: agrega una línea "Call ExportarProgramacionJSON" al final de
' ActualizarFechas (justo después del MsgBox "Programa actualizado
' correctamente.", antes de End Sub), para que un solo clic en el botón que
' ya usas actualice fechas Y publique el JSON del kiosko.

Sub ExportarProgramacionJSON()
    Dim ws As Worksheet
    Dim rutaProyecto As String, rutaJSON As String
    Dim lastRow As Long, r As Long
    Dim maquinaActual As String, contador As Long
    Dim cerrada As Boolean
    Dim filas As String, json As String
    Dim version As Long
    Dim primeraFila As Boolean
    Dim hojaActiva As Worksheet

    ' SiguienteVersion crea (la primera vez) una hoja oculta y Excel activa
    ' brevemente la hoja visible más cercana al ocultarla. Se guarda y
    ' restaura la hoja activa para que el usuario no termine viendo otra hoja.
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

    ' Igual que ActualizarFechas: usa la última fila con contenido en columna J,
    ' no UsedRange (que puede incluir filas con solo formato, sin datos).
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

    For r = 5 To lastRow
        Dim colA As String, colJ As String
        Dim hayContenido As Boolean
        Dim cc As Integer

        colA = Trim(CStr(ws.Cells(r, "A").Value))
        colJ = UCase(Trim(CStr(ws.Cells(r, "J").Value)))

        hayContenido = False
        For cc = 1 To 14 ' A:N, igual que ActualizarFechas
            If Trim(CStr(ws.Cells(r, cc).Value)) <> "" Then
                hayContenido = True
                Exit For
            End If
        Next cc

        If Not hayContenido Then
            ' fila vacía -> ignorar

        ElseIf colA <> "" And Not IsNumeric(colA) And InStr(colJ, "DIA") = 0 Then
            ' encabezado de máquina
            maquinaActual = colA
            contador = 0
            cerrada = False

        ElseIf InStr(colJ, "DIA") > 0 Then
            ' subtotal -> cierra la máquina actual; no vuelve a aceptar filas
            ' hasta el siguiente encabezado de máquina
            cerrada = True

        ElseIf Not cerrada Then
            ' fila productiva (puede tener OP vacío si hay datos en otras columnas,
            ' igual que en ActualizarFechas)
            contador = contador + 1
            Dim idFila As String
            idFila = LimpiarID(maquinaActual) & "_" & Format(contador, "00")

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

        ' Else: fila productiva posterior a un subtotal sin nuevo encabezado de
        ' máquina de por medio -> se ignora (protección contra duplicados).
        End If
    Next r

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"

    GuardarUTF8SinBOM rutaJSON, json

    Dim resultado As String
    resultado = PublicarEnGitHub(rutaProyecto, version)

    MsgBox "Kiosko actualizado." & vbCrLf & "Versión: " & version & vbCrLf & resultado, _
        vbInformation, "Kiosko Producción"
End Sub

' Contador de versión persistido en una hoja oculta de ESTE libro, para que
' sobreviva entre exportaciones sin tocar Programa_Maq.
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

Private Function LimpiarID(texto As String) As String
    Dim t As String
    t = UCase(Trim(texto))
    t = Replace(t, " ", ""): t = Replace(t, "/", ""): t = Replace(t, "-", ""): t = Replace(t, Chr(10), "")
    If Len(t) > 12 Then t = Left(t, 12)
    LimpiarID = t
End Function

Private Function JVal(c As Range) As String
    If IsEmpty(c.Value) Then
        JVal = "null"
    ElseIf IsDate(c.Value) Then
        JVal = """" & Format(c.Value, "yyyy-mm-dd hh:mm") & """"
    ElseIf IsNumeric(c.Value) Then
        JVal = Replace(CStr(c.Value), ",", ".")
    Else
        JVal = """" & Replace(Replace(CStr(c.Value), "\", "\\"), """", "\""") & """"
    End If
End Function

Private Function JStr(texto As String) As String
    JStr = """" & Replace(Replace(texto, "\", "\\"), """", "\""") & """"
End Function

' Escribe contenido UTF-8 sin BOM. ADODB.Stream con Charset="utf-8" añade un
' BOM de 3 bytes al guardar; se descarta releyendo en modo binario desde la
' posición 3 antes de guardar el archivo final.
Private Sub GuardarUTF8SinBOM(ruta As String, contenido As String)
    Dim txtStream As Object, binStream As Object
    Dim bytes() As Byte

    Set txtStream = CreateObject("ADODB.Stream")
    txtStream.Type = 2 ' texto
    txtStream.Charset = "utf-8"
    txtStream.Open
    txtStream.WriteText contenido
    txtStream.Position = 0
    txtStream.Type = 1 ' binario
    txtStream.Position = 3 ' saltar BOM
    bytes = txtStream.Read
    txtStream.Close

    Set binStream = CreateObject("ADODB.Stream")
    binStream.Type = 1
    binStream.Open
    binStream.Write bytes
    binStream.SaveToFile ruta, 2 ' adSaveCreateOverWrite
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
