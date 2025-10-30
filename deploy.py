import os
import subprocess
import sys
from datetime import datetime


def run(command: list[str]) -> tuple[int, str]:
    completed = subprocess.run(command, capture_output=True, text=True)
    output = (completed.stdout or '') + (completed.stderr or '')
    return completed.returncode, output.strip()


def ensure_in_repo(repo_path: str) -> None:
    os.chdir(repo_path)
    code, _ = run(["git", "rev-parse", "--is-inside-work-tree"])
    if code != 0:
        code, out = run(["git", "init"])
        if code != 0:
            print("Git init alınmadı:\n" + out)
            sys.exit(1)


def ensure_origin(remote_url: str) -> None:
    code, _ = run(["git", "remote", "get-url", "origin"])
    if code != 0:
        # origin yoxdur, əlavə edək
        run(["git", "remote", "add", "origin", remote_url])
    else:
        # mövcudsa, URL-i güncəlləməyək; istifadəçi istəsə dəyişər
        pass


def has_changes() -> bool:
    code, out = run(["git", "status", "--porcelain"])
    if code != 0:
        print("git status xətası:\n" + out)
        sys.exit(1)
    return bool(out.strip())


def commit_and_push(default_branch: str) -> None:
    run(["git", "add", "-A"])  # hər şeyi stage et

    if not has_changes():
        print("Dəyişiklik yoxdur. Heç nə push edilmədi.")
        return

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    msg = f"auto: deploy {timestamp}"
    code, out = run(["git", "commit", "-m", msg])
    if code != 0:
        print("commit xətası:\n" + out)
        sys.exit(1)

    # Şaxəni main olaraq qur və push et
    run(["git", "branch", "-M", default_branch])
    code, out = run(["git", "push", "-u", "origin", default_branch])
    if code != 0:
        print("push xətası:\n" + out)
        print("\nQeyd: İlk dəfə push edəndə GitHub giriş pəncərəsi tələb oluna bilər.")
        sys.exit(1)
    print("Push tamamlandı.")


def main() -> None:
    # Layihə qovluğu bu faylın olduğu yerdir
    project_dir = os.path.dirname(os.path.abspath(__file__))
    ensure_in_repo(project_dir)

    # Sənin repoun URL-i (lazım olsa dəyiş):
    origin_url_default = "https://github.com/kral14/oyun-yeni.git"
    ensure_origin(origin_url_default)

    commit_and_push(default_branch="main")


if __name__ == "__main__":
    main()


