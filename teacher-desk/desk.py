"""교사 업무 데스크 실행 파일.

  python desk.py                 업무 데스크 켜기 (브라우저가 자동으로 열림)
  python desk.py --no-browser    브라우저를 열지 않고 켜기
  python desk.py --collect       지금 한 번 수집하고 끝내기
  python desk.py --diagnose cool 쿨메신저 폴더 구조 진단 (결과는 data/diagnose-cool.json)
"""

import argparse
import json
import sys

from desk.collect import SOURCES, Collector, diagnose
from desk.config import Config
from desk.db import DB
from desk.scheduler import Scheduler
from desk.server import App, serve
from desk.telegram import Bot


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # 윈도우 명령 창 한글 깨짐 방지
    p = argparse.ArgumentParser(description="교사 업무 데스크")
    p.add_argument("--config", help="설정 파일 경로 (기본: config.json)")
    p.add_argument("--no-browser", action="store_true")
    p.add_argument("--collect", action="store_true", help="한 번 수집하고 끝내기")
    p.add_argument("--diagnose", choices=sorted(SOURCES), help="폴더 구조 진단")
    args = p.parse_args(argv)

    config = Config(args.config)
    db = DB(config.data_dir / "desk.db")

    if args.diagnose:
        folder = config[SOURCES[args.diagnose]]
        if not folder:
            print("⚙ 설정에서 폴더를 먼저 지정하세요.")
            return 1
        result = diagnose(folder)
        out = config.data_dir / f"diagnose-{args.diagnose}.json"
        out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"진단 결과를 저장했습니다: {out}")
        print("이 파일에는 메시지 내용이 없고 파일 이름·형식만 있습니다. 개발 담당에게 전달하세요.")
        return 0

    bot = Bot(db, config)
    collector = Collector(db, config, notify=bot.notify_collect)
    bot.collector = collector

    if args.collect:
        stats = collector.run("manual")
        print(json.dumps({k: v for k, v in stats.items() if k != "new_ids"}, ensure_ascii=False, indent=2))
        return 0

    app = App(db, config, collector, bot)
    try:
        httpd = serve(app, open_browser=not args.no_browser)
    except OSError:
        print(f"{config['port']}번 포트를 쓸 수 없습니다. 업무 데스크가 이미 켜져 있는지 확인하세요.")
        return 1
    scheduler = Scheduler(db, config, collector)
    scheduler.start()
    bot.start()
    db.log("업무 데스크 시작")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        scheduler.stop()
        bot.stop()
        httpd.server_close()
        db.log("업무 데스크 종료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
