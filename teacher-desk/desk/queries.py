"""화면(대시보드·검색)과 텔레그램이 함께 쓰는 조회."""

from datetime import date, timedelta

from .db import decode_item

EVENT_COLS = ("e.id, e.item_id, e.date, e.end_date, e.time, e.kind, e.category, e.text, e.done, "
              "i.title AS item_title, i.source AS item_source")


def events_between(db, start, end, include_done=True):
    """start~end 와 겹치는 일정 (기간 일정은 끝 날짜까지 포함)."""
    sql = (f"SELECT {EVENT_COLS} FROM events e LEFT JOIN items i ON i.id = e.item_id "
           "WHERE e.date <= ? AND COALESCE(e.end_date, e.date) >= ? "
           "AND (i.status IS NULL OR i.status != 'archived')")
    if not include_done:
        sql += " AND e.done = 0"
    return db.query(sql + " ORDER BY e.date, COALESCE(e.time, '99'), e.id", (end.isoformat(), start.isoformat()))


def today_summary(db, today=None):
    today = today or date.today()
    week_end = today + timedelta(days=7)
    overdue = db.query(
        f"SELECT {EVENT_COLS} FROM events e LEFT JOIN items i ON i.id = e.item_id "
        "WHERE e.kind = 'deadline' AND e.done = 0 AND e.date < ? AND e.date >= ? "
        "AND (i.status IS NULL OR i.status NOT IN ('archived', 'done')) ORDER BY e.date",
        (today.isoformat(), (today - timedelta(days=14)).isoformat()))
    todays = events_between(db, today, today)
    upcoming = events_between(db, today + timedelta(days=1), week_end, include_done=False)
    week = [e for e in upcoming if e["kind"] == "deadline"]
    week_events = [e for e in upcoming if e["kind"] != "deadline"]
    passes = db.query("SELECT * FROM passes WHERE date = ? AND status != 'cancelled' ORDER BY time_out, id",
                      (today.isoformat(),))
    new_items = [decode_item(r) for r in db.query(
        "SELECT * FROM items WHERE status = 'new' ORDER BY received_at DESC LIMIT 10")]
    last_run = db.one("SELECT * FROM runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1")
    return {"date": today.isoformat(), "overdue": overdue, "today": todays, "week_deadlines": week,
            "week_events": week_events,
            "passes": passes, "new_items": new_items, "last_run": last_run}


def search(db, q, limit=30):
    q = q.strip()
    if not q:
        return {"items": [], "events": [], "passes": []}
    like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    items = db.query("SELECT id, source, title, received_at, category, status FROM items "
                     "WHERE title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' "
                     "ORDER BY received_at DESC LIMIT ?", (like, like, limit))
    events = db.query(f"SELECT {EVENT_COLS} FROM events e LEFT JOIN items i ON i.id = e.item_id "
                      "WHERE e.text LIKE ? ESCAPE '\\' ORDER BY e.date DESC LIMIT ?", (like, limit))
    passes = db.query("SELECT * FROM passes WHERE student_name LIKE ? ESCAPE '\\' OR reason LIKE ? ESCAPE '\\' "
                      "ORDER BY date DESC, id DESC LIMIT ?", (like, like, limit))
    return {"items": items, "events": events, "passes": passes}
