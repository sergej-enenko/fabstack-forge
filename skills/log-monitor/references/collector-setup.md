# Level 0 Collector Setup Guide

Step-by-step instructions for setting up the Fabstack Forge log collector.
The collector runs as a GitHub Actions workflow that SSHes to your production
server, fetches logs via whitelisted read-only commands, and commits them
to an orphan branch (`forge-logs`) in your repository.

## Prerequisites

- A GitHub repository with Actions enabled
- SSH access to your production server
- `forge.yml` config with a `collector` section (see `forge-init`)

---

## Step 1: Generate a dedicated SSH key pair

On your local machine, generate an Ed25519 key pair exclusively for the
collector. Do not reuse existing keys.

```bash
ssh-keygen -t ed25519 -C "forge-collector" -f ~/.ssh/forge_ed25519 -N ""
```

This produces two files:
- `~/.ssh/forge_ed25519` (private key -- goes into GitHub Secrets)
- `~/.ssh/forge_ed25519.pub` (public key -- goes onto the server)

## Step 2: Install the lockdown shell script on the server

Copy the generated `forge-readonly-shell` script to the server. This script
restricts the SSH key to a whitelist of read-only commands (docker logs, tail,
journalctl).

```bash
# Copy the script to the server
scp forge-readonly-shell root@YOUR_SERVER:/usr/local/bin/forge-readonly-shell

# Make it executable
ssh root@YOUR_SERVER "chmod 755 /usr/local/bin/forge-readonly-shell"
```

Verify the script is in place:

```bash
ssh root@YOUR_SERVER "cat /usr/local/bin/forge-readonly-shell"
```

## Step 3: Install the public key with authorized_keys restrictions

Add the public key to the deploy user's `authorized_keys` with `command=`
and other restriction options that force all connections through the lockdown
shell.

```bash
# Read the public key
PUBKEY=$(cat ~/.ssh/forge_ed25519.pub)

# Install it with restrictions on the server
ssh root@YOUR_SERVER bash -c 'cat >> /home/deploy/.ssh/authorized_keys << AUTHEOF
command="/usr/local/bin/forge-readonly-shell",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty '"$PUBKEY"'
AUTHEOF'
```

The `command=` option forces every SSH session using this key through the
lockdown shell, regardless of what command the client requests. The additional
`no-*` options disable tunneling, X11, agent forwarding, and interactive PTY.

## Step 4: Verify the lockdown

Test that allowed commands work and disallowed commands are rejected.

```bash
# Should succeed: fetch docker logs
ssh -i ~/.ssh/forge_ed25519 deploy@YOUR_SERVER \
  "docker logs --since=1h app 2>&1 | tail -100"

# Should succeed: tail a log file
ssh -i ~/.ssh/forge_ed25519 deploy@YOUR_SERVER \
  "tail -n 500 /var/log/nginx/error.log"

# Should be REJECTED: arbitrary command
ssh -i ~/.ssh/forge_ed25519 deploy@YOUR_SERVER "rm -rf /"
# Expected output: forge-readonly-shell: command rejected: rm -rf /
```

## Step 5: Add secrets to GitHub

Go to your repository Settings > Secrets and variables > Actions and add
three repository secrets:

| Secret name          | Value                                                |
|----------------------|------------------------------------------------------|
| `SSH_PRIVATE_KEY`    | Contents of `~/.ssh/forge_ed25519` (the private key) |
| `FORGE_HOST`         | Your server IP or hostname (e.g. `178.104.10.221`)   |
| `FORGE_USER`         | The SSH user on the server (e.g. `deploy`)           |

To add via the GitHub CLI:

```bash
# Private key (read from file)
gh secret set SSH_PRIVATE_KEY < ~/.ssh/forge_ed25519

# Host
gh secret set FORGE_HOST --body "178.104.10.221"

# User
gh secret set FORGE_USER --body "deploy"
```

The secret names must match the `collector.secret_names` values in your
`forge.yml` config.

## Step 6: Test the workflow

Trigger the collector workflow manually to verify end-to-end operation.

```bash
# Trigger via GitHub CLI
gh workflow run forge-collect.yml

# Watch the run
gh run list --workflow=forge-collect.yml --limit=1

# Once complete, verify the forge-logs branch has content
git fetch origin forge-logs
git log origin/forge-logs --oneline -1
git show origin/forge-logs:logs/fetched-at.txt
```

If the run succeeds, you should see a commit on the `forge-logs` branch with
log files under `logs/`. The `fetched-at.txt` file contains the UTC timestamp
of the collection run.

---

## Troubleshooting

**Workflow fails at "Setup SSH":**
Check that the `SSH_PRIVATE_KEY` secret contains the full private key
including the `-----BEGIN` and `-----END` lines.

**Workflow fails at "Fetch logs from production":**
- Verify `FORGE_HOST` and `FORGE_USER` are correct
- Check that the public key is installed on the server (Step 3)
- Ensure the lockdown shell script exists at `/usr/local/bin/forge-readonly-shell`
- Check server firewall allows SSH from GitHub Actions IP ranges

**"forge-readonly-shell: command rejected":**
The command sent by the collector does not match any whitelist pattern.
Check the regex patterns in the lockdown shell script match the commands
configured in your `forge.yml` collector sources.
