import io
from fastapi import HTTPException
from fastapi.responses import Response


def xlsx_response(headers: list, rows: list, filename: str) -> Response:
    """Build a downloadable .xlsx Response from a header row + data rows.

    Shared by every list page's filtered export endpoint so exports beyond
    the current page (unlike a client-side CSV over already-loaded rows)
    share one implementation.
    """
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=422, detail="XLSX export requires openpyxl to be installed on the server.")
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
