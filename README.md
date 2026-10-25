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
## 2. Jenkins Credentials

1. **`dockerhub-creds`**: Username with password (Docker Hub access token)
2. **`ec2-ssh-key`**: SSH Username with private key (`user: ec2-user`, key for EC2 #2)
3. **`rds-endpoint`**: Secret text (e.g., `campustask-db.xxxx.rds.amazonaws.com`)
4. **`rds-db-creds`**: Username with password (RDS master credentials)

---

## 3. CI/CD Pipeline Stages

1. **Checkout:** Jenkins pulls code from the `main` branch.
2. **Unit Tests:** Jest runs tests inside a `node:20-alpine` container.
3. **Build Docker Image:** Tagged with the build number and `latest`.
4. **Push to Docker Hub.:**  The image is published to the registry.
5. **Deploy to Test:** `deploy.sh` spins up a local Postgres container and runs the app on port 8081.
6. **Automated Tests:** `smoke-test.sh` verifies CRUD operations on the Test environment.
7. **Deploy to Production:** Jenkins SSHes into EC2 #2, passes RDS credentials securely, and deploys the image to port 80.
8. **Verify Production:** Smoke tests hit the live Elastic IP to confirm health.
9. **Rollback:** If the production health check fails, `deploy.sh` will automatically halt the deployment and restore the previous stable Docker image.

---

## 4. CloudWatch Monitoring

- **Dashboard:** `CampusTask-Production`
- **Basic Metrics:** `CPUUtilization`, `NetworkIn/Out`, `DiskReadOps`
- **Advanced Metrics:** CloudWatch Agent is installed on EC2 #2 (with `CloudWatchAgentServerPolicy`) to capture RAM and Disk Space usage.

---

## 5. Expected Demonstration Outcomes

1. **Production Accessibility:** The website at `http://13.213.98.45` will load successfully, displaying the current build version and a `Database: up` status.
2. **Data Persistence:** Creating a task on the website will save data directly to Amazon RDS, ensuring it survives container redeployments.
3. **Monitoring Baseline:** The CloudWatch dashboard will display steady baseline performance metrics for the production server.
4. **Automated Trigger:** Modifying a UI element and pushing to GitHub will instantly trigger the Jenkins pipeline without manual intervention.
5. **Pipeline Execution:** Jenkins will successfully execute all stages (Build, Test, Push, Deploy) and turn green.
6. **Deployment Monitoring:** The CloudWatch dashboard will capture a CPU spike on EC2 #2 as the new production container initializes.
7. **Zero-Downtime Validation:** Refreshing the production site will reflect the new UI version, and the previously created task will remain intact.
8. **Failure Prevention:** Pushing code with a broken unit test will cause Jenkins to fail at the testing stage, preventing the buggy code from reaching production.
9. **Automated Rollback:** Pushing code with a fatal runtime error (e.g., invalid DB string) will cause the production health check to fail, prompting `deploy.sh` to automatically revert to the previous stable version.

---