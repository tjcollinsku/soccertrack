# Shell Cheatsheet (Git Bash on Windows)

Quick reference for the Bash commands used on this project and the daily
basics. Keep this open in a VS Code tab until the muscle memory lands.

---

## The mental model

A shell command is three parts: **program** + **flags** + **arguments**.

```
ls -la some/folder
│  │   │
│  │   └─ argument (what to act on)
│  └─ flag (how to behave; -l long format, -a includes hidden)
└─ program (what to run)
```

Flags: `-x` short (one letter), `--name` long. `-la` is two shorts smooshed.

---

## Moving around

| Command | What it does |
|---|---|
| `pwd` | Print working directory (where am I?) |
| `ls` | List files here |
| `ls -la` | List all files with details |
| `cd folder` | Change into folder |
| `cd ..` | Up one level |
| `cd ~` | Home directory |
| `cd -` | Previous directory you were in |

---

## Looking at files

| Command | What it does |
|---|---|
| `cat file.txt` | Print whole file to screen |
| `head file.txt` | First 10 lines |
| `tail file.txt` | Last 10 lines |
| `tail -f log.txt` | Follow a file as it grows (great for server logs) |
| `less file.txt` | Scrollable viewer (`q` to quit, `/` to search) |

---

## Finding things

| Command | What it does |
|---|---|
| `grep "text" file.txt` | Find lines containing "text" |
| `grep -r "text" .` | Recursive search in current folder |
| `find . -name "*.py"` | Find files by name pattern |

---

## Manipulating files

| Command | What it does |
|---|---|
| `mkdir folder` | Make a folder |
| `touch file.txt` | Make an empty file (or update timestamp) |
| `cp src dest` | Copy |
| `mv src dest` | Move or rename |
| `rm file.txt` | Delete a file (**no undo**) |
| `rm -rf folder` | Delete folder and contents (**no undo — dangerous**) |

---

## Running things

| Command | What it does |
|---|---|
| `python script.py` | Run a Python file |
| `python -m module` | Run a Python module (pip, venv, manage.py) |
| `./manage.py runserver` | Run script directly (Unix); on Windows use `python manage.py ...` |

---

## Environment & history

| Command | What it does |
|---|---|
| `echo $PATH` | Print an environment variable |
| `export FOO=bar` | Set env var for this session |
| `which python` | Show which `python` will run |
| `history` | Show recent commands |
| `↑` arrow | Recall previous command |
| `Ctrl+R` | Search command history (type, press Enter) |
| `Ctrl+C` | Kill the running command |
| `Ctrl+L` or `clear` | Clear the screen |

---

## Pipes and redirection — the superpower

**Pipe `|`** — send output of one command into another:
```bash
ls | grep .py          # list files, filter to .py only
cat log.txt | tail -20 # show last 20 lines
```

**Redirect `>`** — send output to a file (**overwrites**):
```bash
pip freeze > requirements.txt
```

**Append `>>`** — send output to a file (adds to end):
```bash
echo "new line" >> notes.txt
```

**And `&&`** — run second command only if first succeeds:
```bash
python manage.py makemigrations && python manage.py migrate
```

---

## Commands we've used on SoccerTrack

```bash
# Create a virtual environment in .venv
python -m venv .venv

# Install a package into the venv
.venv/Scripts/python.exe -m pip install django

# Run Django management commands
.venv/Scripts/python.exe manage.py makemigrations tracker
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py createsuperuser
.venv/Scripts/python.exe manage.py runserver
.venv/Scripts/python.exe manage.py test tracker -v 2

# Activate the venv (so "python" alone means the venv's python)
source .venv/Scripts/activate
# ...then deactivate to turn it off
deactivate

# Freeze the installed packages into requirements.txt
.venv/Scripts/python.exe -m pip freeze > requirements.txt

# On a new machine, recreate the environment
python -m venv .venv
source .venv/Scripts/activate
pip install -r requirements.txt
```

---

## Habits that level you up fast

1. **Tab to autocomplete.** Type a few letters of a file/folder name, press
   Tab. Shell finishes it. Two Tabs shows all matches. Kills typos.
2. **`↑` and `Ctrl+R`.** Don't retype commands. Up-arrow walks history;
   Ctrl+R searches it.
3. **Three rescue keys:** `Ctrl+C` (kill command), `Ctrl+L` (clear screen),
   `cd` with no argument (go home when lost).

---

## Danger list — no undo, no trash

- `rm file.txt` → file is gone.
- `rm -rf folder/` → folder + contents gone. **Never run with a variable or
  wildcard you haven't triple-checked.** Classic disaster: `rm -rf $FOO/`
  when `$FOO` is empty becomes `rm -rf /` and deletes the entire filesystem.
- `> file.txt` → if file exists, contents are wiped before output is written.

---

## Windows/Bash gotchas

- **Use forward slashes in paths.** `.venv\Scripts\python.exe` gets mangled
  because `\v` and `\S` look like escape sequences. Use
  `.venv/Scripts/python.exe`. Windows accepts forward slashes everywhere.
- **Spaces in paths need quotes.** `cd "Documents/Job Search"` not
  `cd Documents/Job Search`.
- **Line endings.** Git Bash files default to Unix `\n`, Windows expects
  `\r\n`. Usually invisible; occasionally breaks shell scripts. Fix with
  `dos2unix file.sh` if it ever bites you.

---

## Git — the commands you'll run every day

*(Not shell per se, but lives in the shell.)*

| Command | What it does |
|---|---|
| `git status` | What's changed; what's staged |
| `git diff` | Show unstaged changes |
| `git diff --staged` | Show staged changes |
| `git add file.py` | Stage a specific file |
| `git add .` | Stage everything in current folder (careful — can grab secrets) |
| `git commit -m "message"` | Commit staged changes |
| `git log` | Show history (`q` to quit) |
| `git log --oneline` | Compact history |
| `git push` | Push commits to remote (e.g. GitHub) |
| `git pull` | Fetch + merge remote changes |
| `git branch` | List branches; current one has `*` |
| `git checkout -b feature-x` | Create and switch to new branch |
| `git switch main` | Switch to main branch |
