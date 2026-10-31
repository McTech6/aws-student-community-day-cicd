# Forge: Building a CI/CD Pipeline on AWS

Companion repo for the talk **"Building a CI/CD Pipeline on AWS"** at AWS
Student Community Day.

Forge is a small full-stack app (React + NestJS + PostgreSQL). This guide
takes you from an empty laptop to the same setup shown in the talk, **in
your own GitHub and AWS accounts**:

- The app running on your computer
- Your own copy of the code on GitHub
- Every pull request checked automatically by AWS CodeBuild
- Every merge to `main` deployed automatically by AWS CodePipeline: tests,
  then **staging**, then your approval, then **production**
- The whole AWS setup written as code (AWS CDK), so you can create it and
  delete it with one command

Every step has the exact commands to copy, what you should see, and what
to do if it fails. No prior AWS experience needed.

---

## Contents

- [What you will build](#what-you-will-build)
- [Before you start: time and cost](#before-you-start-time-and-cost)
- **Level 1: free, no AWS needed**
  - [Part 1: Install the tools](#part-1-install-the-tools)
  - [Part 2: Get the code into your own GitHub repository](#part-2-get-the-code-into-your-own-github-repository)
  - [Part 3: Run the app on your computer](#part-3-run-the-app-on-your-computer)
- **Level 2: the full pipeline on AWS**
  - [Part 4: Set up your AWS account safely](#part-4-set-up-your-aws-account-safely)
  - [Part 5: Connect your terminal to AWS](#part-5-connect-your-terminal-to-aws)
  - [Part 6: Deploy the pipeline](#part-6-deploy-the-pipeline)
  - [Part 7: Ship a change through the pipeline](#part-7-ship-a-change-through-the-pipeline)
  - [Part 8: Delete everything (do not skip)](#part-8-delete-everything-do-not-skip)
- [Troubleshooting](#troubleshooting)
- [How it works (and why)](#how-it-works-and-why)
- [Reference: project structure, scripts, API, database](#reference)

---

## What you will build

**The app, running on AWS** (one copy for staging, one for production):

```mermaid
flowchart LR
    user["Browser"] -->|HTTPS| cf["CloudFront"]
    cf -->|"/* (website)"| s3["S3 bucket (private)<br/>React build"]
    cf -->|"/api/*"| alb["Load balancer<br/>(only accepts CloudFront)"]
    alb --> ecs["ECS Fargate<br/>NestJS API container"]
    ecs --> rds[("RDS PostgreSQL<br/>private subnet")]
    sm["Secrets Manager<br/>generated DB password"] -.-> ecs
```

**The pipeline that gets your code there:**

```mermaid
flowchart LR
    pr["Pull request"] --> checks["CodeBuild PR checks<br/>pass/fail shown on GitHub"]
    checks -->|merge| src["Source<br/>push to main"]
    src --> build["Build<br/>secret scan, lint, typecheck,<br/>tests, audit, build"]
    build --> self["UpdatePipeline<br/>pipeline updates itself"]
    self --> assets["Assets<br/>Docker image + website files"]
    assets --> stg["Staging<br/>deploy + smoke test"]
    stg --> appr{"Your approval<br/>(email)"}
    appr --> prod["Production<br/>deploy + smoke test"]
```

GitHub only stores the code. Everything else runs on AWS.

---

## Before you start: time and cost

| Level | What you do | Time | Cost |
|-------|-------------|------|------|
| **Level 1** | Parts 1–3: run the app and all the quality checks on your computer | 1–1.5 hours | Free |
| **Level 2** | Parts 4–8: the full pipeline with staging and production on AWS | 2–3 hours (about 1 hour of it is waiting) | About **$3–4 per day** while it runs |

> [!WARNING]
> **Level 2 costs real money for as long as it runs**, even when nobody
> uses the app (load balancers, databases and containers are billed by the
> hour). Do Level 2 in one sitting and finish with
> [Part 8: Delete everything](#part-8-delete-everything-do-not-skip). Left
> running for a month, it would cost around $100. Part 6 sets up a budget
> alert that emails you before that happens.

New AWS accounts often come with Free Tier credits that cover some or all
of this. Check *Billing and Cost Management → Credits* in the AWS console.

You will need:

- A computer with macOS, Linux or Windows 10/11 (8 GB RAM or more)
- A free [GitHub account](https://github.com/signup)
- For Level 2: an AWS account (needs a credit or debit card; Part 4 shows
  how to create one)

---

# Level 1: free, no AWS needed

## Part 1: Install the tools

**Goal:** install Git, Node.js 22, Docker, the GitHub CLI and the AWS CLI.

> [!IMPORTANT]
> **Windows users:** use **WSL 2** (Ubuntu inside Windows). Every command in
> this guide is for a Linux/macOS terminal, and WSL gives you exactly that.
> Open **PowerShell as Administrator** and run:
>
> ```powershell
> wsl --install -d Ubuntu
> ```
>
> Restart your computer, open **Ubuntu** from the Start menu, and choose a
> username and password. From now on, type every command in the **Ubuntu**
> window and follow the **Linux** instructions below.

### 1.1 Git

| System | Command |
|--------|---------|
| macOS | `xcode-select --install` |
| Linux / WSL | `sudo apt update && sudo apt install -y git curl unzip` |

Tell Git who you are (use the email of your GitHub account):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main
```

### 1.2 Node.js 22 (with nvm)

nvm lets you install the exact Node version this project uses.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```

**Close the terminal and open a new one**, then:

```bash
nvm install 22
nvm alias default 22
```

### 1.3 Docker

The app's local database runs in Docker, and the API is packaged as a
Docker image.

| System | How |
|--------|-----|
| macOS | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it |
| Windows (WSL) | Install [Docker Desktop](https://www.docker.com/products/docker-desktop/). In Docker Desktop: *Settings → Resources → WSL integration →* turn on **Ubuntu** |
| Linux | Follow [Install Docker Engine](https://docs.docker.com/engine/install/), then run `sudo usermod -aG docker $USER` and log out and back in |

### 1.4 GitHub CLI

Makes signing in to GitHub from the terminal painless.

| System | Command |
|--------|---------|
| macOS | `brew install gh` (needs [Homebrew](https://brew.sh)) |
| Linux / WSL | Follow [the official instructions](https://github.com/cli/cli/blob/trunk/docs/install_linux.md#debian-ubuntu-linux-raspberry-pi-os-apt) (copy the block under "Debian, Ubuntu…") |

Sign in:

```bash
gh auth login
```

Answer: **GitHub.com** → **HTTPS** → **Yes** (authenticate Git) →
**Login with a web browser**. Copy the code it shows, press Enter, and
paste the code in the browser.

### 1.5 AWS CLI (needed for Level 2)

You need **version 2.32.0 or newer**.

| System | How |
|--------|-----|
| macOS | Download and run the [macOS installer](https://awscli.amazonaws.com/AWSCLIV2.pkg) |
| Linux / WSL | Run the commands below |

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install && rm -rf aws awscliv2.zip
```

(On an ARM Linux machine, replace `x86_64` with `aarch64`.)

### ✅ Check: you're done when

Run each command; every one must print a version:

```bash
git --version              # git version 2.x
node -v                    # v22.x.x
npm -v                     # 10.x or 11.x
docker --version           # Docker version 2x.x
docker compose version     # Docker Compose version v2.x
gh --version               # gh version 2.x
aws --version              # aws-cli/2.32.0 or higher
```

**If it fails:**

- `command not found` right after installing: close the terminal, open a new one, try again.
- `node -v` shows another version: run `nvm use 22`.
- Docker says `Cannot connect to the Docker daemon`: start Docker Desktop (or on Linux, `sudo systemctl start docker`).

---

## Part 2: Get the code into your own GitHub repository

**Goal:** your own copy of this repo on GitHub, and on your computer. The
pipeline will watch **your** repo.

Pick **one** option.

### Option A: Fork (recommended, 1 minute)

A fork is your own copy of someone else's repository, linked back to the
original.

```bash
mkdir -p ~/projects && cd ~/projects
gh repo fork McTech6/aws-student-community-day-cicd --clone
cd aws-student-community-day-cicd
gh repo set-default "$(gh api user --jq .login)/aws-student-community-day-cicd"
```

The last line makes sure that later, pull requests go to **your** fork,
not to the original repo.

### Option B: Create your own repository from scratch

Choose this one if you want to practise creating a Git repository yourself.

1. Download the code: on this repo's GitHub page, click **Code → Download
   ZIP**, and unzip it into `~/projects/forge`.
2. Turn the folder into a Git repository and make the first commit:

   ```bash
   cd ~/projects/forge
   git init
   git add .
   git commit -m "Initial commit: Forge app with CI/CD on AWS"
   ```

3. Create the repository on GitHub and push to it:

   ```bash
   gh repo create forge --public --source=. --remote=origin --push
   ```

   You can use `--private` instead of `--public`; everything in this guide
   works with private repos too.

### ✅ Check: you're done when

```bash
git remote -v      # shows github.com/<your-username>/...
git status         # "On branch main ... nothing to commit, working tree clean"
```

…and the repo shows up at `https://github.com/<your-username>`.

> [!CAUTION]
> **Never commit secrets** (passwords, keys, `.env` files). This repo's
> `.gitignore` already keeps `.env` files out of Git, and every build on AWS
> scans for leaked secrets before doing anything else.

---

## Part 3: Run the app on your computer

**Goal:** the app running locally, and all the checks the pipeline runs
passing on your machine.

All commands run from the repo folder (the one you `cd`'d into in Part 2).

### 3.1 Install the dependencies

```bash
nvm use            # switches to Node 22 (reads the .nvmrc file)
npm install
```

This takes 1–3 minutes.

### 3.2 Create your local settings file

```bash
cp .env.example apps/api/.env
```

The defaults already point at the local database you start next. You
don't need to edit anything.

### 3.3 Start the database and fill it with sample data

```bash
docker compose up -d
```

This starts PostgreSQL in a container on port 5432. Then create the
tables and add sample people:

```bash
cd apps/api
npx prisma migrate deploy
npx prisma db seed
cd ../..
```

You should see `All migrations have been successfully applied` and a seed
message.

### 3.4 Start the API and the website

You need **two terminals**, both in the repo folder.

Terminal 1, the API:

```bash
npm run dev:api
```

Wait for `Forge API listening on http://localhost:3001/api`.

Terminal 2, the website:

```bash
npm run dev:web
```

### 3.5 Try it

1. Open http://localhost:3001/api/health. You should see `{"ok":true,"service":"forge-api"}`.
2. Open http://localhost:3000. You should see the People list with three sample people.
3. Add a person. Then try adding the **same email again**: the app refuses (the API returns `409 Conflict`).
4. Remove someone.

### 3.6 Run the quality checks (what the pipeline runs)

Stop both servers (`Ctrl+C` in each terminal), then:

```bash
npm run ci
```

This runs, in order: **lint** (code style), **typecheck** (TypeScript),
**tests** (Vitest, for the website, the API and the infrastructure code),
**audit** (known security holes in dependencies) and **build**. On AWS,
the pipeline runs exactly this command, and refuses to deploy if anything
fails.

### 3.7 Optional: run the API the way AWS runs it, in Docker

```bash
docker build -f apps/api/Dockerfile -t forge-api .
docker run --rm -p 3001:3001 --add-host=host.docker.internal:host-gateway \
  -e DATABASE_URL="postgresql://forge:forge@host.docker.internal:5432/forge" \
  forge-api
```

The container first applies database migrations, then starts the API.
Check http://localhost:3001/api/health again, then stop it with `Ctrl+C`.

### 3.8 Stop the database

```bash
docker compose down          # stop (keeps your data)
docker compose down -v       # stop and delete the data
```

### ✅ Check: you're done when

- The website worked at http://localhost:3000.
- `npm run ci` ended without errors.

**Congratulations: Level 1 is done.** You have a full-stack app with
automated quality gates, and it costs nothing. Ready for AWS?

**If it fails:**

- `port is already allocated` / `address already in use` on 5432: another PostgreSQL is running on your computer. Stop it (`sudo service postgresql stop` on Linux/WSL), or in `compose.yaml` change `"5432:5432"` to `"5433:5432"` and in `apps/api/.env` change `localhost:5432` to `localhost:5433`.
- `EBADENGINE` or odd npm errors: run `nvm use 22`, then `npm install` again.
- `Can't reach database server`: is Docker running? Run `docker compose ps` and check the database is `healthy`.

---

# Level 2: the full pipeline on AWS

> [!WARNING]
> From here on, things cost money (about $3–4/day). Plan to finish with
> [Part 8](#part-8-delete-everything-do-not-skip) the same day.

## Part 4: Set up your AWS account safely

**Goal:** an AWS account with a locked-down root user, and a separate
admin user for daily work.

### 4.1 Create the account (skip if you have one)

Go to https://aws.amazon.com and click **Create an AWS Account**. You
need an email address, a phone number and a card. Choose the **Basic
support (free)** plan.

### 4.2 Protect the root user with MFA

The email you signed up with is the **root user**: it can do anything,
including closing the account. Protect it, then stop using it.

1. Sign in at https://console.aws.amazon.com as the root user.
2. Top right, click your account name → **Security credentials**.
3. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**.
4. Choose **Authenticator app** (Google Authenticator, Microsoft
   Authenticator, Authy…), scan the QR code, and enter two codes.

### 4.3 Create an admin user for daily work

1. In the console search bar, type **IAM** and open it.
2. Left menu: **Users** → **Create user**.
3. User name: `admin-<yourname>`. Tick **Provide user access to the AWS
   Management Console**, choose **I want to create an IAM user**, set a
   **custom password**, and untick "must create a new password". Click
   **Next**.
4. Choose **Attach policies directly**, search for and tick
   **AdministratorAccess**. Click **Next**, then **Create user**.
5. **Copy the "Console sign-in URL"** shown on the last page (it looks
   like `https://<your-account-id>.signin.aws.amazon.com/console`) and
   save it somewhere.
6. Open that user (**Users → admin-<yourname>**) → **Security
   credentials** → **Assign MFA device**, and set up MFA for this user too.

Sign out, and sign back in with the **console sign-in URL**, your admin
user name and password. Use this user from now on, never the root user.

### 4.4 Choose the region

Top right of the console, next to your user name, select **US East (N.
Virginia) us-east-1**. Everything in this guide lives there.

### ✅ Check: you're done when

You are signed in to the console as `admin-<yourname>` (top right), in
**N. Virginia**, and both users have MFA.

---

## Part 5: Connect your terminal to AWS

**Goal:** the AWS CLI on your computer can act as your admin user.

`aws login` signs you in through the browser and gives the CLI
short-lived credentials that renew themselves. No access keys to leak.

```bash
aws login
```

- If it asks for a **region**, type `us-east-1`.
- A browser opens. Sign in as **admin-<yourname>** (with the sign-in URL
  from 4.3) and approve the request.
- No browser on this machine? Use `aws login --remote` and follow the
  instructions.

Set the default region and check who you are:

```bash
aws configure set region us-east-1
aws sts get-caller-identity
```

### ✅ Check: you're done when

The last command prints JSON with your **Account** (12 digits) and an
**Arn** ending in `user/admin-<yourname>`.

The session lasts up to 12 hours. If a command later says your
credentials expired, just run `aws login` again.

---

## Part 6: Deploy the pipeline

**Goal:** the pipeline running in your account, deploying staging and
production.

All commands run from the repo folder, unless a step says `cd infra`.

### 6.1 Point the pipeline at your repository

Open `infra/cdk.json` in an editor and find this line:

```json
"forge:repository": "McTech6/aws-student-community-day-cicd",
```

Change it to **your** GitHub username and repository name, for example:

```json
"forge:repository": "your-username/aws-student-community-day-cicd",
```

(With Option B from Part 2, the repository name is `forge`.)

Commit and push the change. The pipeline reads the code from GitHub, so
GitHub must have it:

```bash
git add infra/cdk.json
git commit -m "Point the pipeline at my repository"
git push
```

### 6.2 Tell AWS where to send alert emails

Replace the email with yours. It is stored in your AWS account (SSM
Parameter Store), not in the code:

```bash
aws ssm put-parameter --name /forge/alert-email --type String \
  --value "you@example.com"
```

### 6.3 Prepare CDK (once per AWS account)

The AWS CDK turns the TypeScript in `infra/` into AWS resources. First
build the website (CDK needs it to exist), then "bootstrap" your account:
this creates the storage and roles CDK uses for deployments.

```bash
npm run build:web
cd infra
npx cdk bootstrap "aws://$(aws sts get-caller-identity --query Account --output text)/us-east-1"
```

Takes 2–3 minutes. You should see `✅ Environment aws://…/us-east-1
bootstrapped`.

### 6.4 Create the alerts topic and budget

Still in `infra/`:

```bash
npx cdk deploy ForgeAccount
```

Type `y` when it asks about security changes. This creates:

- **forge-alerts**: an email topic for pipeline and budget alerts
- **forge-monthly**: a $25 monthly budget that emails you at 40% and 80%
  of actual spend, and when the forecast goes over 100%

Now **check your inbox** for **"AWS Notification - Subscription
Confirmation"** (look in spam too) and click **Confirm subscription**.
Without this you get no alerts.

### 6.5 Connect AWS to GitHub

This lets AWS read your repository without you storing a GitHub password
or token anywhere.

1. Open the Connections page:
   https://us-east-1.console.aws.amazon.com/codesuite/settings/connections?region=us-east-1
   (Or search the console for **CodePipeline** → left menu **Settings →
   Connections**.)
2. Click **Create connection**. Provider: **GitHub**. Connection name:
   **`forge-github`**. Click **Connect to GitHub**.
3. A GitHub window opens: click **Authorize AWS Connector for GitHub**.
4. Back on AWS, click **Install a new app**. On GitHub, choose your
   account, select **Only select repositories**, pick **your repo**, and
   click **Install**.
5. Back on AWS, click **Connect**. The status must say **Available**.
   (If it says **Pending**, click the connection → **Update pending
   connection** and finish the GitHub steps.)

Store the connection's ID in your account so the pipeline can find it
(copy the whole command, it looks the ID up for you):

```bash
aws ssm put-parameter --name /forge/github-connection-arn --type String \
  --value "$(aws codeconnections list-connections --provider-type-filter GitHub \
    --query "Connections[?ConnectionName=='forge-github'].ConnectionArn | [0]" --output text)"
```

### 6.6 Deploy the pipeline (the only time you deploy it by hand)

Still in `infra/`:

```bash
npx cdk deploy ForgePipeline
```

Type `y` when it asks about security changes. It takes 3–5 minutes and
creates:

- The **forge** pipeline (CodePipeline)
- The **forge-pr-checks** project (CodeBuild), connected to your
  repository's pull requests

> [!NOTE]
> **First time ever in your account**, this deploy may fail with
> `PipelineNotifications ... Invalid request provided`. That's AWS creating
> a helper role for notifications in the background. **Wait 10 minutes
> and run the same command again.** It works the second time.

### 6.7 Watch the first run

The pipeline starts by itself as soon as it exists. Open it:
https://us-east-1.console.aws.amazon.com/codesuite/codepipeline/pipelines/forge/view?region=us-east-1

| Stage | What happens | First run |
|-------|--------------|-----------|
| **Source** | Downloads your code from GitHub | seconds |
| **Build** | Secret scan, then `npm run ci` (lint, typecheck, tests, audit, build), then `cdk synth` | ~3 min |
| **UpdatePipeline** | The pipeline updates its own definition from your code | ~2 min |
| **Assets** | Builds the API Docker image and uploads it and the website files | ~3 min |
| **Staging** | Creates network, database, API and website, then runs the smoke test | ~20 min |
| **Production** | Waits for **your approval**, then the same as staging | ~20 min |

Click **View details** on any action to see its live logs. In the Build
step, the **Reports** tab shows every test that ran.

### 6.8 Check staging, then approve production

When Staging is green, find its URL (in the repo folder):

```bash
aws cloudformation describe-stacks --stack-name forge-staging-web \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text
```

Open the `https://….cloudfront.net` address it prints. That's your app on
AWS. Add a person.

You also get an email saying approval is needed. In the pipeline page,
in the **Production** stage, click **Review** → write a comment →
**Approve** → **Submit**.

When Production is green, get its URL:

```bash
aws cloudformation describe-stacks --stack-name forge-production-web \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text
```

### ✅ Check: you're done when

- Every stage of the pipeline is green.
- Both URLs open the app, and you can add people.
- You received emails for "approval needed" and "pipeline succeeded".

**If it fails:** see [Troubleshooting](#troubleshooting). The usual
suspects are a typo in `forge:repository` (Source fails) or a check that
also fails locally with `npm run ci` (Build fails).

---

## Part 7: Ship a change through the pipeline

**Goal:** experience the whole CI/CD loop: branch → pull request →
automatic checks → merge → automatic deploy.

### 7.1 A good change

Create a branch:

```bash
git switch main && git pull
git switch -c show-my-name
```

Open `apps/web/src/App.tsx` and change the text under the logo:

```tsx
<p className="app-brand__sub">REZA Path</p>
```

to your name:

```tsx
<p className="app-brand__sub">Built by Your Name</p>
```

Check, commit, push, and open a pull request:

```bash
npm run ci
git add apps/web/src/App.tsx
git commit -m "Show my name in the header"
git push -u origin show-my-name
gh pr create --fill --base main
```

Open the pull request link it prints. Within a few seconds a check from
**AWS CodeBuild (forge-pr-checks)** appears, and after about 5 minutes it
turns green. Click **Details** to watch it run on AWS.

Merge it:

```bash
gh pr merge --merge --delete-branch
```

Now watch the pipeline page: it starts on its own, deploys staging,
smoke-tests it, and waits for your approval. Approve, and a few minutes
later your name is on the production site. (Refresh with `Ctrl+Shift+R`
if you still see the old version.)

### 7.2 A bad change (the pipeline saves you)

Let's break something on purpose. Create a branch:

```bash
git switch main && git pull
git switch -c break-emails
```

Open `apps/api/src/people/people.service.ts` and find:

```ts
email: draft.email.trim().toLowerCase(),
```

Remove `.toLowerCase()` so it reads `email: draft.email.trim(),`. Now
`Ada@Forge.test` and `ada@forge.test` would count as two different
people. A unit test catches it:

```bash
npm test
```

You'll see a failing test. Push it anyway and open a pull request:

```bash
git commit -am "Break email normalisation (on purpose)"
git push -u origin break-emails
gh pr create --fill --base main
```

The CodeBuild check on the pull request turns **red**, and the bad code
never reaches staging or production. Close the pull request without
merging:

```bash
gh pr close break-emails --delete-branch
git switch main
```

### 7.3 Optional: make the check required

So nobody (including you) can merge a pull request with a red check:

1. On GitHub, open your repo → **Settings** → **Rules** → **Rulesets** →
   **New ruleset** → **New branch ruleset**.
2. Ruleset name: `main`. Enforcement status: **Active**.
3. Target branches: **Add target → Include default branch**.
4. Tick **Require a pull request before merging** and **Require status
   checks to pass**. Under status checks, click **Add checks** and pick
   the one containing `forge-pr-checks`.
5. Click **Create**.

(Rulesets on private repos need a paid GitHub plan; on public repos
they're free.)

### ✅ Check: you're done when

- Your name is on the production site.
- You saw a green check and a red check on two pull requests.

---

## Part 8: Delete everything (do not skip)

**Goal:** stop all charges.

From the repo folder:

```bash
cd infra
npx cdk destroy 'ForgePipeline/Production/*' 'ForgePipeline/Staging/*'
```

Type `y`. This deletes both environments: websites, APIs, databases and
networks. It takes 15–25 minutes (databases are slow to delete). Then:

```bash
npx cdk destroy ForgePipeline
npx cdk destroy ForgeAccount
```

Skip the last line if you want to keep the budget alerts (the budget and
topic are free).

Finally, clean up the leftovers:

```bash
aws ssm delete-parameter --name /forge/github-connection-arn
aws ssm delete-parameter --name /forge/alert-email
```

- **GitHub connection:** AWS console → Connections (link in 6.5) → select
  `forge-github` → **Delete**. On GitHub: your profile picture →
  **Settings → Applications → AWS Connector for GitHub → Configure →
  Uninstall**.
- **CDK bootstrap** (optional, costs cents per month): AWS console →
  **CloudFormation** → stack **CDKToolkit** → **Delete**. Skip this if you
  use CDK for other projects.

### ✅ Check: you're done when

- **CloudFormation** (us-east-1) shows no stacks starting with `forge-` or
  `Forge`.
- **RDS → Databases** is empty, and **EC2 → Load balancers** shows no
  Forge load balancer.
- The next day, **Billing and Cost Management → Bills** shows charges
  stopped.

---

## You did it

If you followed this far, you have:

- [x] Run a full-stack TypeScript app with automated quality gates
- [x] Created a GitHub repository and connected it to AWS without storing
      a single password or token
- [x] Defined an entire AWS environment (network, database, containers,
      CDN) as code, and created it with one command
- [x] Built a pipeline that tests every change, deploys to staging, waits
      for approval, and deploys to production
- [x] Watched it block a bad change before it reached users
- [x] Cleaned up after yourself like a professional

That's a real-world CI/CD setup. Take a screenshot of your green pipeline
and share it. Put it on your CV.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| `Unable to locate credentials` / `ExpiredToken` / `The security token included in the request is expired` | Your CLI session expired. Run `aws login`. |
| `apps/web/dist is missing` when running a `cdk` command | Run `npm run build:web` in the repo folder, then retry. |
| `cdk bootstrap` fails | Check `aws sts get-caller-identity` works and the region is `us-east-1`. If a stack called `CDKToolkit` already exists and is in a failed state, delete it in CloudFormation and run bootstrap again. |
| `cdk deploy ForgePipeline` fails with `PipelineNotifications ... Invalid request provided` | First notification rule in a new account. Wait 10 minutes and deploy again. |
| `cdk deploy ForgePipeline` fails with `/forge/github-connection-arn` or `/forge/alert-email` "not found" | You skipped 6.2 or 6.5. Run the `aws ssm put-parameter` command from that step. |
| Pipeline **Source** fails: "could not access the repository" | `forge:repository` in `infra/cdk.json` doesn't match your repo, or the GitHub app wasn't given access to it (GitHub → Settings → Applications → AWS Connector for GitHub → Configure → add the repo). Fix, push, and click **Release change**. |
| Pipeline **Build** fails | Click **View details** for the logs. It's almost always a check that also fails locally: run `npm run ci`. If the log says `leaks found`, you committed a secret: remove it, and treat it as leaked (change that password or key). |
| **Staging** or **Production** deploy fails | Click the failed action → the CloudFormation link → the **Events** tab. The first red `CREATE_FAILED` line explains why. |
| Deploy fails with "Your account must be verified before you can add new CloudFront resources" | Brand-new AWS accounts sometimes need verification. Open a free case in **AWS Support Center** ("Account and billing"), or wait a day. |
| **SmokeTest** fails right after a first deploy | The new API may still be starting. Click **Retry** on the stage. |
| No check appears on the pull request | The PR must target `main`. In CodeBuild → **forge-pr-checks** → **Build history**, see if a build started. Check the connection status is **Available**. |
| Site shows an old version | CloudFront caches files briefly. Hard refresh (`Ctrl+Shift+R`, or `Cmd+Shift+R` on Mac). |
| `cdk destroy` fails on a stack | Run it again; deletions can time out. If it still fails, delete the stack in the CloudFormation console. |

---

## How it works (and why)

- **One URL for website and API.** CloudFront serves the React app from a
  private S3 bucket and forwards `/api/*` to the API. The browser only
  ever talks to one origin, so there's no CORS setup, you get HTTPS
  without buying a domain, and the same website build works in staging
  and production.
- **The load balancer only accepts CloudFront.** Its security group only
  allows CloudFront's IP ranges, and CloudFront adds a secret header that
  the load balancer checks. Requests sent straight to the load balancer
  are dropped.
- **The database is unreachable from the internet.** RDS sits in subnets
  with no internet route, and only the API's security group may connect.
  RDS generates the password into Secrets Manager; ECS hands it to the
  container at startup. No human ever sees it.
- **No NAT Gateway.** API containers run in public subnets with a public
  IP (but only accept traffic from the load balancer). A NAT Gateway
  would cost about $32/month per zone, more than everything else here.
- **Database migrations at startup.** Each new API container runs
  `prisma migrate deploy` before it starts serving. If a migration fails,
  the container never passes its health check, and ECS's circuit breaker
  rolls back to the previous version.
- **Build once, deploy many.** The Docker image and website files are
  built once in the Assets stage, then the exact same files go to staging
  and production.
- **Self-mutating pipeline.** The pipeline is defined in
  `infra/lib/pipeline-stack.ts`. Change it, push, and the UpdatePipeline
  stage applies the change before anything is deployed.
- **Pull request checks you can't tamper with.** The PR check steps are
  defined in AWS (in the pipeline stack), not in a file in the repo, so a
  pull request can't switch them off. Pull requests from forks only run
  after a maintainer approves them, and the check has no AWS permissions
  worth stealing.
- **Secrets never in the repo.** Your email and the GitHub connection ID
  live in SSM Parameter Store; the database password lives in Secrets
  Manager; gitleaks scans every build.

**Going further:** custom domain with HTTPS end to end (Route 53 + ACM),
alarms that roll back a bad release automatically, separate AWS accounts
for staging and production, blue/green deployments with CodeDeploy.

---

## Reference

### Project structure

```
forge/
├── package.json              npm workspaces + run scripts
├── compose.yaml              Local PostgreSQL in Docker
├── .env.example              Env variables (copy to apps/api/.env)
├── .nvmrc                    Node version (22)
├── .gitleaks.toml            Secret scanner settings
├── apps/
│   ├── web/                  Frontend (React + Vite)
│   │   └── src/
│   │       ├── App.tsx       Top bar + Home / People views
│   │       └── people/       People page, form, list, API calls
│   └── api/                  Backend (NestJS)
│       ├── Dockerfile        Multi-stage image for ECS
│       ├── docker-entrypoint.sh  Migrate, then start the API
│       ├── prisma/           Schema, migrations, seed data
│       └── src/
│           ├── main.ts       Starts the server, CORS, validation
│           ├── health.controller.ts  GET /api/health
│           └── people/       Routes, service, validation, tests
├── packages/
│   └── shared/               Types shared between web and api
├── scripts/
│   ├── smoke-test.sh         Checks a deployed environment through its URL
│   └── secret-scan.sh        gitleaks scan, run first in every build
└── infra/                    AWS CDK app (TypeScript)
    ├── bin/forge.ts          Entry point: which stacks exist
    ├── lib/
    │   ├── account-stack.ts  Alerts topic + cost budget (once per account)
    │   ├── pipeline-stack.ts CodePipeline + pull request checks
    │   ├── forge-stage.ts    One environment = the four stacks below
    │   └── stacks/           network, database, api, web
    ├── test/                 Infrastructure tests
    └── cdk.json              CDK settings: region, repository, budget
```

### AWS stacks

| Stack | What it creates |
|-------|-----------------|
| `ForgeAccount` | `forge-alerts` email topic, `forge-monthly` $25 budget |
| `ForgePipeline` | The `forge` pipeline and the `forge-pr-checks` CodeBuild project |
| `forge-<env>-network` | VPC over 2 availability zones: public subnets (load balancer, API) and private isolated subnets (database); security groups |
| `forge-<env>-database` | RDS PostgreSQL 17 (`db.t4g.micro`, encrypted, private), password in Secrets Manager |
| `forge-<env>-api` | ECS Fargate service + Application Load Balancer, logs in CloudWatch |
| `forge-<env>-web` | Private S3 bucket + CloudFront distribution |

`<env>` is `staging` or `production`. Settings live in `infra/cdk.json`
(`forge:region`, `forge:repository`, `forge:branch`,
`forge:monthlyBudgetUsd`). Useful commands from `infra/`: `npx cdk diff`
(preview changes), `npx cdk synth` (see the generated CloudFormation),
`npm test` (infrastructure tests).

### Scripts

| Command (from the repo folder) | What it does |
|--------------------------------|--------------|
| `npm run dev:web` | Start the website in dev mode (http://localhost:3000) |
| `npm run dev:api` | Start the API in watch mode (http://localhost:3001/api) |
| `npm run build:web` | Build the website to `apps/web/dist` |
| `npm run build:api` | Build the API to `apps/api/dist` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | TypeScript checks |
| `npm test` | All unit tests (Vitest) |
| `npm run ci` | Everything the pipeline runs: lint, typecheck, test, audit, build |

### Environment variables

| Name | Where | Purpose |
|------|-------|---------|
| `DATABASE_URL` | `apps/api/.env` | Postgres connection string. Defaults to the local Docker database. |
| `CORS_ORIGINS` | `apps/api/.env` | Optional. Origins allowed to call the API directly. Defaults to `http://localhost:3000`. |
| `PORT` | `apps/api/.env` | Optional. API port. Defaults to `3001`. |
| `VITE_API_URL` | `apps/web/.env` | Optional. API base URL for the website. Defaults to `/api`. |

On AWS the container gets `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and
`DB_PASSWORD` instead of `DATABASE_URL`; `docker-entrypoint.sh` builds the
connection string from them.

### API

All routes are under `/api`.

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| GET | `/api/health` | 200 | |
| GET | `/api/people` | 200, list of people | |
| POST | `/api/people` | 201, the new person | 400 invalid body, 409 duplicate email |
| DELETE | `/api/people/:id` | 204, no body | 404 unknown id |

Rules for `POST /api/people`:

- `name`: 2–80 characters
- `email`: valid email, stored trimmed and lowercased
- `role`: optional, `intern` or `core`, defaults to `intern`

```bash
curl -s -X POST http://localhost:3001/api/people \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@forge.test"}'
```

### Database

Defined in `apps/api/prisma/schema.prisma`:

| Model | Fields |
|-------|--------|
| **Person** | `id`, `name`, `email` (unique), `role` (`INTERN` / `CORE`), `createdAt` |
| **Project** | `id`, `name`, `status` (`IDEA` / `ACTIVE` / `DONE`), `createdAt` |
| **Task** | `id`, `title`, `status` (`TODO` / `DOING` / `DONE`), optional `projectId`, optional `assigneeId`, `createdAt` |

Use fake data only, e.g. `someone@forge.test`.

### Roadmap

- [x] People: list, add, remove
- [x] CI/CD on AWS, all as CDK code
- [ ] Projects and Tasks API + UI
- [ ] Alarms that roll back a bad release automatically
