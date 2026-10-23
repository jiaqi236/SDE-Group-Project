# CampusTask – CI/CD Pipeline Project (SWE40006)

CampusTask is a task manager built with **HTML/CSS/JavaScript, Node.js/Express, and PostgreSQL**. It is deployed via a fully automated **GitHub → Jenkins → Docker → AWS EC2 + RDS** pipeline, monitored using **AWS CloudWatch**.

---

## 1. Architecture & Resources

- **EC2 #1 (Jenkins & Test):** Amazon Linux 2023 (`t3.small` + 2GB Swap). Runs Jenkins and the Test environment (App on port 8081 + local PostgreSQL container). Elastic IP: `47.131.190.77`
- **EC2 #2 (Production):** Amazon Linux 2023 (`t3.micro`). Runs the live app container on port 80. Elastic IP: `13.213.98.45`
- **Amazon RDS:** PostgreSQL 16 (`db.t3.micro`). Hosts the production database `campustask`, accessible only via EC2 #2's Security Group.
- **CloudWatch:** Monitors production EC2 metrics (CPU, Network, Disk, Memory).

### Pipeline Flow Diagram
```text
Developer ──(git push)──► GitHub ──(Webhook)──► Jenkins (EC2 #1)
                                                   │
                                        (Build/Test/Deploy)
                                                   │
                                                   ▼
                                              Docker Hub
                                                   │
                    ┌──────────────────────────────┴──────────────────────────────┐
                    ▼                                                             ▼
        Test Environment (EC2 #1)                                   Production (EC2 #2)
        App + Local PostgreSQL                                      App + Amazon RDS
        (Automated Smoke Tests)                                     (Health Check / Rollback)
```
## 4. Jenkins Credentials

Ensure the following 4 credentials are configured in Jenkins (`Manage Jenkins > Credentials > Global`):

1. **`dockerhub-creds`**: Username with password (Docker Hub access token)
2. **`ec2-ssh-key`**: SSH Username with private key (`user: ec2-user`, key for EC2 #2)
3. **`rds-endpoint`**: Secret text (e.g., `campustask-db.xxxx.rds.amazonaws.com`)
4. **`rds-db-creds`**: Username with password (RDS master credentials)

---

## 5. CI/CD Pipeline Stages

1. **Checkout:** Jenkins pulls code from the `main` branch.
2. **Unit Tests:** Jest runs tests inside a `node:20-alpine` container.
3. **Build Docker Image:** Tagged with the build number and `latest`.
4. **Push to Docker Hub.**
5. **Deploy to Test:** `deploy.sh` spins up a local Postgres container and runs the app on port 8081.
6. **Automated Tests:** `smoke-test.sh` verifies CRUD operations on the Test environment.
7. **Deploy to Production:** Jenkins SSHes into EC2 #2, passes RDS credentials securely, and deploys the image to port 80.
8. **Verify Production:** Smoke tests hit the live Elastic IP to confirm health.
9. **Rollback:** If the production health check fails, `deploy.sh` automatically restores the previous stable image.

---

## 6. CloudWatch Monitoring

- **Dashboard:** `CampusTask-Production`
- **Basic Metrics:** `CPUUtilization`, `NetworkIn/Out`, `DiskReadOps`
- **Advanced Metrics:** CloudWatch Agent is installed on EC2 #2 (with `CloudWatchAgentServerPolicy`) to capture RAM and Disk Space usage.

---

## 7. Demonstration Plan (Presentation)

1. Show the production site (`http://13.213.98.45`) and verify the version number and Database status.
2. Create a task to show data persistence (saved in RDS, not the container).
3. Open the CloudWatch dashboard and note the baseline metrics.
4. Change a UI heading locally, commit, and `git push`.
5. Watch Jenkins automatically trigger and execute all stages.
6. Show the CloudWatch CPU spike as the new production container spins up.
7. Refresh the production site to show the new version and the previously created task still exists.
8. **Failing Test:** Push a broken test to show Jenkins halting the deployment.
9. **Rollback:** Push a broken code change (e.g., DB connection string) to show `deploy.sh` automatically rolling back to the safe version.

---

## 8. Troubleshooting

- **`/health` returns 503 or triggers rollback:** Check RDS security group (must allow EC2 #2), verify `rds-endpoint` and `rds-db-creds` in Jenkins.
- **Jenkins fails `docker: command not found`:** Ensure Jenkins is in the docker group (`sudo usermod -aG docker jenkins`) and restarted.
- **CloudWatch missing Memory/Disk metrics:** Verify the IAM role is attached to EC2 #2 and the CloudWatch agent is running (`sudo systemctl status amazon-cloudwatch-agent`).