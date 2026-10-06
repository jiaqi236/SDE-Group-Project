# CampusTask – CI/CD Pipeline Project (SWE40006)

A task manager built with **HTML/CSS/JavaScript** (front end), **Node.js + Express** (REST API) and
**PostgreSQL** (database), deployed through a
**GitHub → Jenkins → Docker → Docker Hub → Test → AWS EC2 + Amazon RDS** pipeline.

```
Browser ──► Express container (serves the web page + /api/tasks + /health) ──► PostgreSQL
                                                                  Test:       PostgreSQL container
                                                                  Production: Amazon RDS
```

## Project structure

| Path | Purpose |
|---|---|
| `public/` | Front end: `index.html`, `style.css`, `js/app.js` (UI, calls the API), `js/tasks.js` (validation helpers) |
| `server/` | Back end: `app.js` (routes), `repo-pg.js` (PostgreSQL), `repo-memory.js` (dev only), `index.js` (start-up) |
| `tests/` | Jest unit tests (helpers, REST API with Supertest, SQL layer with pg-mem) |
| `Dockerfile` | Packages the app (Node 20 Alpine) |
| `docker-compose.yml` | Runs app + PostgreSQL locally with one command |
| `Jenkinsfile` | The pipeline (pipeline-as-code) |
| `scripts/deploy.sh` | Deploys an image, health-checks app + database, rolls back automatically on failure |
| `scripts/smoke-test.sh` | Automated checks incl. create/read/update/delete through the database |

### API

| Method & path | Action |
|---|---|
| `GET /api/tasks` | List tasks |
| `POST /api/tasks` `{"title":"..."}` | Create a task (1–100 characters) |
| `PATCH /api/tasks/:id` `{"done":true}` | Mark done / not done |
| `DELETE /api/tasks/:id` | Delete a task |
| `DELETE /api/tasks/completed` | Delete all completed tasks |
| `GET /health` | `200 {"status":"ok","database":"up"}` or `503` when the database is unreachable |

Database table (created automatically on start-up): `tasks(id SERIAL PK, title VARCHAR(100), done BOOLEAN, created_at TIMESTAMPTZ)`.

## 1. Run it locally

> The page **cannot** be opened by double-clicking `index.html` any more, because tasks now come from the API.
> Always start the server and open it through `http://localhost`.

**Option A – quickest, no Docker or database needed (data kept in memory only):**
```bash
npm install
npm run dev            # open http://localhost:3000
npm test               # unit tests
```

**Option B – with a real PostgreSQL (needs Docker Desktop):**
```bash
docker compose up --build      # open http://localhost:8080
```

## 2. One-time infrastructure setup (AWS)

You need **two EC2 instances** and **one RDS database**, all in the same region and the same VPC (the default VPC is fine).

| Resource | Purpose |
|---|---|
| EC2 #1 `jenkins-server` | Jenkins + the **Test** environment (app on port 8081 + a PostgreSQL container) |
| EC2 #2 `prod-server` | **Production**: runs the app container on port 80 |
| RDS `campustask-db` | **Production** PostgreSQL database |

### A. Docker Hub
1. Create an account and a public repository named `campustask`.
2. Account Settings > Security > create an **access token** (used as the password in Jenkins).

### B. Production EC2 (`prod-server`, Amazon Linux 2023, t3.micro)
1. Security group `prod-sg`: inbound **SSH 22** (from the Jenkins server’s IP only) and **HTTP 80** (anywhere).
2. Install Docker:
   ```bash
   sudo dnf install -y docker && sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user      # log out and in again afterwards
   ```
3. Add the Jenkins key pair’s public key to `~/.ssh/authorized_keys` if it differs from the instance key pair.

### C. Amazon RDS PostgreSQL (production database)
1. EC2 > Security Groups > create **`rds-sg`** in the same VPC with one inbound rule:
   **PostgreSQL, port 5432, source = `prod-sg`** (the security group, not an IP, and *not* “anywhere”).
2. RDS > **Create database** > Standard create:
   - Engine: **PostgreSQL** (16.x) · Template: **Free tier** (or Dev/Test)
   - DB instance identifier: `campustask-db`
   - Master username: `campustask` · set a strong password and keep it safe
   - Instance class: `db.t3.micro` (or `db.t4g.micro`) · Storage: 20 GiB gp3, **disable storage autoscaling**
   - Connectivity: same VPC as `prod-server` · **Public access: No** · VPC security group: `rds-sg`
   - **Additional configuration > Initial database name: `campustask`** (easy to miss!)
   - Disable Multi-AZ and Performance Insights (cost); keep automated backups (1 day is enough)
3. Wait until the status is **Available**, then copy the **Endpoint** (looks like `campustask-db.xxxx.<region>.rds.amazonaws.com`).
4. (Optional check) from `prod-server`:
   ```bash
   sudo dnf install -y postgresql15
   psql "host=<ENDPOINT> user=campustask dbname=campustask sslmode=require"
   ```
   If this times out, the security group rule in step 1 is wrong.

> **Cost tip:** RDS bills while it is running. Stop the instance (RDS > Actions > Stop temporarily, up to 7 days) and stop the EC2 instances when you are not working. Check your account’s free tier / credits and set a billing alert. **Delete everything after the assessment.**

### D. Jenkins server (`jenkins-server`, Ubuntu 22.04, t3.small or larger)
1. Security group: inbound **SSH 22** and **8080** (Jenkins) from your IP only; **8081** from your IP (to view the Test site).
2. Install Docker and Jenkins (needs Java 17), then let Jenkins use Docker:
   ```bash
   sudo usermod -aG docker jenkins && sudo systemctl restart jenkins
   ```
3. Install plugins: Pipeline, Git, GitHub, Credentials Binding, **SSH Agent**.
4. Add credentials (Manage Jenkins > Credentials > Global). IDs must match exactly:

   | ID | Kind | Value |
   |---|---|---|
   | `dockerhub-creds` | Username with password | Docker Hub username + access token |
   | `ec2-ssh-key` | SSH Username with private key | user `ec2-user` + private key for `prod-server` |
   | `rds-endpoint` | Secret text | the RDS endpoint from step C3 |
   | `rds-db-creds` | Username with password | `campustask` + the RDS password |

### E. GitHub
1. Push this project to a GitHub repository (branch `main`).
2. Repository Settings > Webhooks > add `http://<JENKINS_IP>:8080/github-webhook/` (content type JSON, event: push).
3. In Jenkins create a **Multibranch Pipeline** (or a Pipeline job “from SCM”, branch `*/main`) and tick
   *GitHub hook trigger for GITScm polling*.

### F. Edit the Jenkinsfile
Replace `your-dockerhub-username` and `YOUR_EC2_PUBLIC_IP` (the production server) in the `environment` block.

## 3. How the pipeline works

1. **Checkout** – Jenkins pulls the code.
2. **Unit Tests** – Jest runs inside a `node:20-alpine` container (Supertest for the API, pg-mem for the SQL); fails if coverage is below 70%.
3. **Build Docker Image** – tagged with the build number and `latest`; the number appears in the page footer.
4. **Push to Docker Hub**.
5. **Deploy to Test** – no `DB_HOST` is set, so `deploy.sh` starts a PostgreSQL container and the app container (port 8081). Test data lives in a Docker volume, never in production.
6. **Automated tests on Test** – `smoke-test.sh` checks the pages, `/health` (database up) and a full create/read/update/delete cycle.
7. **Deploy to Production** – only on `main`; Jenkins SSHes to `prod-server` and runs `deploy.sh` with the RDS settings (sent over the SSH connection, not on a command line).
8. **Verify Production** – the same smoke tests against the public IP.

If the health check fails (app crash **or** database unreachable), `deploy.sh` restarts the previous image (**rollback**) and the build fails.

## 4. Demo script (presentation)

1. Show the production site: footer shows the build number and `Database: up`. Add a task.
2. Change a heading or colour, commit and push.
3. Watch Jenkins run every stage; show test results, coverage, and the new Docker Hub tag.
4. Refresh production: the version has increased **and your task is still there** (data lives in RDS, not in the container).
5. **Failing test:** add a failing test, push, show the pipeline stops before any deployment.
6. **Rollback:** push a version that breaks the app (e.g. wrong port in `server/index.js`), show `deploy.sh` rolling back to the previous version.

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Page shows “Start the server and open http://localhost…” | You opened the HTML file directly – run `npm run dev` |
| Pipeline: `/health` returns 503 / rollback after deploy | Database unreachable: check `rds-sg` allows `prod-sg`, endpoint credential, password, and that the initial database `campustask` was created |
| `no pg_hba.conf entry … no encryption` | `DB_SSL` must be `true` for RDS (the Jenkinsfile sets this) |
| `permission denied` running docker in Jenkins | Add `jenkins` to the `docker` group and restart Jenkins |
| Production stage skipped | The build is not on `main` |
| `docker logs campustask-prod` | Shows the app’s database errors (run on `prod-server`) |

## 6. Metrics to record for the report
Build success rate, commit-to-production time (Jenkins stage view), test coverage (Jest output),
health check results, rollback time, and proof that data survives a redeploy.
