Option Explicit

Sub ExportarProgramacionJSON()
    Dim ws As Worksheet
    Dim rutaProyecto As String, rutaJSON As String
    Dim ultimaFila As Long, r As Long
    Dim maquinaActual As String, contador As Long
    Dim cerrada As Boolean
    Dim filas As String, json As String
    Dim version As Long
    Dim primeraFila As Boolean

    ' ===== AJUSTA SOLO ESTA LÍNEA SI MUEVES LA CARPETA =====
    rutaProyecto = "C:\progplantaglobal.vercel.app\"
    ' ========================================================

    rutaJSON = rutaProyecto & "public\data\programacion.json"
    Set ws = ThisWorkbook.Sheets("PROGRAMACION MAQUINADO")

    Dim celdaVersion As Range
    Set celdaVersion = ws.Range("ZZ1")
    If IsEmpty(celdaVersion.Value) Then
        celdaVersion.Value = 1
    Else
        celdaVersion.Value = celdaVersion.Value + 1
    End If
    version = celdaVersion.Value

    ultimaFila = ws.UsedRange.Rows(ws.UsedRange.Rows.Count).Row

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

    For r = 5 To ultimaFila
        Dim valOP As Variant, valCant As Variant, opStr As String, cantStr As String
        valOP = ws.Cells(r, 1).Value
        valCant = ws.Cells(r, 9).Value ' columna I = POR PRODUCIR
        opStr = Trim(valOP & "")
        cantStr = Trim(valCant & "")

        If opStr = "" And cantStr = "" Then
            ' fila vacía separadora -> ignorar

        ElseIf opStr = "" And cantStr <> "" Then
            ' fila de subtotal -> cierra la máquina actual; no vuelve a
            ' aceptar filas de OP hasta el siguiente encabezado de máquina.
            cerrada = True

        ElseIf opStr <> "" And Not IsNumeric(valOP) Then
            ' fila de encabezado de máquina
            maquinaActual = opStr
            contador = 0
            cerrada = False

        ElseIf IsNumeric(valOP) And Not cerrada Then
            ' fila de OP válida
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

        ' Else: IsNumeric(valOP) And cerrada -> fila posterior al subtotal, se ignora
        ' (protege contra bloques duplicados pegados por error después del subtotal).
        End If
    Next r

    json = "{""version"":" & version & ",""ultimaActualizacion"":""" & Format(Now, "yyyy-mm-dd hh:mm:ss") & _
        """,""columnas"":[" & colJSON & "],""filas"":[" & filas & "]}"

    GuardarUTF8SinBOM rutaJSON, json

    Dim resultado As String
    resultado = PublicarEnGitHub(rutaProyecto, version)

    MsgBox "Exportación completada." & vbCrLf & "Versión: " & version & vbCrLf & resultado, _
        vbInformation, "Kiosko Producción"
End Sub

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
