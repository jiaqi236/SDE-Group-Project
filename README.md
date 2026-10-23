CampusTask – CI/CD Pipeline Project (SWE40006)

A task manager built with HTML, CSS, and JavaScript (front end), Node.js + Express (REST API), and PostgreSQL (database).

The application is deployed through a GitHub → Jenkins → Docker → Docker Hub → Test → AWS EC2 + Amazon RDS CI/CD pipeline, with AWS CloudWatch instrumentation.

Application Architecture
Browser
   |
   v
Express Container
(Serves the web page, /api/tasks, and /health)
   |
   v
PostgreSQL

Testing: PostgreSQL container
Production: Amazon RDS PostgreSQL
Monitoring: AWS CloudWatch
Project Structure
Path	Purpose
public/	Front end: index.html, style.css, js/app.js (UI and API calls), and js/tasks.js (validation helpers)
server/	Back end: app.js (routes), repo-pg.js (PostgreSQL), repo-memory.js (development only), and index.js (startup)
tests/	Jest unit tests, REST API tests with Supertest, and SQL-layer tests with pg-mem
Dockerfile	Packages the application using Node.js 20 Alpine
docker-compose.yml	Runs the application and PostgreSQL locally
Jenkinsfile	Defines the CI/CD pipeline as code
scripts/deploy.sh	Deploys an image, health-checks the application and database, and automatically rolls back on failure
scripts/smoke-test.sh	Runs automated checks, including create/read/update/delete operations through the database
API Endpoints
Method	Endpoint	Description
GET	/api/tasks	Lists all tasks
POST	/api/tasks	Creates a task using {"title":"..."}. Title must contain 1–100 characters.
PATCH	/api/tasks/:id	Marks a task as done or not done using {"done":true}
DELETE	/api/tasks/:id	Deletes a task
DELETE	/api/tasks/completed	Deletes all completed tasks
GET	/health	Returns 200 {"status":"ok","database":"up"} or 503 if the database is unreachable
Database Schema

The database table is created automatically during application startup.

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100),
    done BOOLEAN,
    created_at TIMESTAMPTZ
);

1. Run the Application Locally
Important: Do not open index.html by double-clicking it. Tasks are retrieved through the API, so the server must be running. Open the application through its local HTTP address instead.
Option A: Run Without Docker or PostgreSQL

This option uses in-memory storage, so task data is not persistent.

npm install
npm run dev


Open the application at:

http://localhost:3000


Run the unit tests:

npm test

Option B: Run with PostgreSQL Using Docker

This option requires Docker Desktop.

docker compose up --build


Open the application at:

http://localhost:8080

2. One-Time Infrastructure Setup (AWS)

The infrastructure consists of two EC2 instances, one Amazon RDS database, and CloudWatch monitoring. All resources should be configured in the same AWS Region and VPC. The default VPC can be used.

Infrastructure Overview
Resource	Purpose
EC2 #1: jenkins-server	Hosts Jenkins and the testing environment, including the application on port 8081 and a PostgreSQL container
EC2 #2: prod-server	Hosts the production application on port 80 and the CloudWatch agent
RDS: campustask-db	Production PostgreSQL database, accessible privately from the production EC2 instance
CloudWatch: CampusTask-Production	Monitoring dashboard for CPU, memory, network, and disk metrics

Note: Elastic IP addresses are assigned to both EC2 instances to provide stable public IP addresses across instance reboots.

A. Docker Hub Setup
Create a Docker Hub account.
Create a public repository named campustask.
Navigate to Account Settings → Security.
Create an access token to use as the password for Jenkins authentication.
B. Production EC2 Setup

Instance: prod-server

Operating system: Amazon Linux 2023
Instance type: t3.micro

Configure the production security group, prod-sg, with the following inbound rules:

Protocol	Port	Source
SSH	22	Jenkins server's public IP address
HTTP	80	0.0.0.0/0

Install and enable Docker:

sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user


Log out and log back in for the Docker group membership to take effect.

Add the Jenkins server's public SSH key to the production instance's ~/.ssh/authorized_keys file so Jenkins can deploy the application.

C. Amazon RDS PostgreSQL Setup

Amazon RDS stores production task data independently of the application container.

1. Configure the RDS Security Group

Navigate to EC2 → Security Groups and create a security group named rds-sg in the same VPC.

Configure the following inbound rule:

Type	Port	Source
PostgreSQL	5432	prod-sg security group

Use the security group as the source, not an IP address or 0.0.0.0/0.

2. Create the RDS Database

Navigate to RDS → Create database and select Standard create.

Setting	Value
Engine	PostgreSQL 16.x
Template	Free tier or Dev/Test, as available
DB instance identifier	campustask-db
Master username	campustask
Instance class	db.t3.micro or db.t4g.micro, subject to availability and eligibility
Storage	20 GiB gp3
Storage autoscaling	Disabled
VPC	Same VPC as prod-server
Public access	No
VPC security group	rds-sg
Initial database name	campustask

Set a strong database password and store it securely.

For a cost-conscious student project, disable Multi-AZ and Performance Insights if appropriate. Keep automated backups enabled, with a one-day retention period if supported by the selected configuration.

Wait until the database status becomes Available, then copy its endpoint. It should look similar to:

campustask-db.xxxx.<region>.rds.amazonaws.com

3. Optional Database Connectivity Check

Run the following commands on prod-server:

sudo dnf install -y postgresql15


Connect using the actual RDS endpoint:

psql "host=<ENDPOINT> user=campustask dbname=campustask sslmode=require"


Replace <ENDPOINT> with the real RDS endpoint.

If the connection times out, check the RDS security group, VPC configuration, routing, and network connectivity. If authentication fails, verify the username and password.

D. AWS CloudWatch Instrumentation (Level 2)
1. Basic EC2 Metrics

Basic EC2 metrics are available in CloudWatch without installing an agent.

Open CloudWatch → Metrics → EC2 → Per-Instance Metrics.
Select the production EC2 instance.
Confirm that the following metrics are being populated:
CPUUtilization
NetworkIn
NetworkOut
DiskReadOps

Allow approximately five minutes for initial metric data to appear.

2. Create the CloudWatch Dashboard
Navigate to CloudWatch → Dashboards.
Create a dashboard named CampusTask-Production.
Add a line widget.
Select the relevant EC2 metrics.
Save the dashboard and share its URL with the team.
3. Optional: Monitor Memory and Disk Usage

Default EC2 metrics do not include guest operating system memory utilization or filesystem disk usage.

Install the CloudWatch agent on prod-server:

sudo dnf install -y amazon-cloudwatch-agent


Run the configuration wizard:

sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard


Select the required metrics, including:

mem_used_percent
disk_used_percent

Enable and start the agent:

sudo systemctl enable --now amazon-cloudwatch-agent


Attach an IAM role to prod-server with the CloudWatchAgentServerPolicy policy, or an appropriately scoped custom policy, so the agent can publish metrics.

Add the memory and disk metrics to the dashboard.

E. Jenkins Server Setup

Instance: jenkins-server

Operating system: Amazon Linux 2023
Instance type: t3.small
Storage: 30 GB

Configure the Jenkins security group to allow:

Port	Purpose
22	SSH administration
8080	Jenkins web interface
8081	Testing application

Restrict access to Jenkins and SSH to trusted IP addresses wherever possible.

Install Java 17, Docker, and Jenkins according to their official installation instructions.

Allow Jenkins to use Docker:

sudo usermod -aG docker jenkins
sudo systemctl restart jenkins


Troubleshooting note: The Jenkins instance was upgraded from t3.micro to t3.small, and 2 GB of swap memory was configured to reduce the risk of running out of memory during Docker builds.

Install the following Jenkins plugins:

Pipeline
Git
GitHub
Credentials Binding
SSH Agent
Docker Pipeline
Configure Jenkins Credentials

Navigate to Manage Jenkins → Credentials → Global and add the following credentials.

Credential ID	Kind	Value
dockerhub-creds	Username with password	Docker Hub username and access token
ec2-ssh-key	SSH Username with private key	Username ec2-user and the private key used to connect to prod-server
rds-endpoint	Secret text	RDS endpoint from Section 2C
rds-db-creds	Username with password	Username campustask and the RDS database password

Credential IDs must match those referenced in the Jenkinsfile.

F. GitHub Setup
Push the project to a GitHub repository using the main branch.
Navigate to Repository Settings → Webhooks.
Add the following webhook URL:
http://47.131.190.77:8080/github-webhook/

Set the content type to application/json.
Configure the webhook to trigger on push events.
In Jenkins, create a Multibranch Pipeline or a Pipeline job configured from SCM.
Configure the repository URL and branch (*/main).
Enable the GitHub hook trigger for Git SCM polling if required by the selected job configuration.
Security note: The webhook URL uses HTTP. For a production-quality setup, use HTTPS with appropriate access controls. Also verify that the public IP address and Jenkins port are correct before configuring the webhook.
3. How the CI/CD Pipeline Works

The pipeline automates testing, building, deployment, and verification.

Pipeline Stages
Checkout: Jenkins retrieves the latest source code from GitHub.
Unit Tests: Jest runs inside a node:20-alpine container. Supertest tests the REST API, and pg-mem tests the SQL layer. The pipeline fails if test coverage is below 70%.
Build Docker Image: Jenkins builds the application image and tags it with the build number and latest. The build number is displayed in the application footer.
Push to Docker Hub: Jenkins pushes the image to the campustask repository.
Deploy to Test: Without DB_HOST, deploy.sh starts a PostgreSQL container and the application container on port 8081. Test data is stored in a Docker volume and remains separate from production data.
Automated Tests on Test: smoke-test.sh checks the application pages, verifies /health, and performs a complete create/read/update/delete cycle.
Deploy to Production: Only builds from main are deployed. Jenkins connects to prod-server over SSH and runs deploy.sh with the RDS configuration. Database settings are passed over the SSH connection rather than exposed directly on the command line.
Verify Production: The same smoke tests run against the production public IP address.
CloudWatch Monitoring: The CampusTask-Production dashboard displays CPU and network activity on the production EC2 instance while the new container starts.
Automatic Rollback

If the application health check fails because of an application crash or database connectivity problem, deploy.sh restores the previous image and the Jenkins build fails.

This helps prevent a failed deployment from leaving the production application running an unhealthy version.

4. Project Levels Covered
Level	Requirement	How It Is Satisfied
Level 1	Four-server pipeline: code repository, CI/build, testing, and production	GitHub, Jenkins, test environment, and production EC2
Level 2	Instrumentation of the production server	AWS CloudWatch dashboard and agent for CPU, memory, network, and disk metrics
Level 3	Deploy a working application and verify it	CampusTask deployed to production EC2 with RDS; /health returns an OK response when the database is reachable
Level 4	Test automation triggered by source code changes	A GitHub push webhook triggers the Jenkins pipeline automatically
5. Demo Script (Presentation)

Use the following sequence to demonstrate the CI/CD pipeline.

Step 1: Show the Production Application
Open the production website.
Show the build number in the footer.
Confirm that the database status displays up.
Add a new task to demonstrate that the application works.
Step 2: Show CloudWatch Monitoring
Open the CampusTask-Production dashboard.
Explain the baseline CPU and network activity.
If configured, show memory and disk utilization metrics.
Step 3: Trigger a Deployment
Change a heading, colour, or other visible element in the source code.
Commit and push the changes to the main branch.
Step 4: Demonstrate Jenkins Automation
Show the GitHub webhook triggering Jenkins.
Follow the pipeline stages as they execute.
Show the test results, coverage report, and Docker Hub image tag.
Step 5: Verify the Production Deployment
Show the CPU activity on EC2 as the new container starts.
Refresh the production website.
Confirm that the build number has increased.
Verify that the previously created task is still present, demonstrating that production data is stored in RDS rather than inside the application container.
Step 6: Demonstrate a Failed Test
Add a test that intentionally fails.
Push the changes.
Show that the pipeline stops before deployment.
Step 7: Demonstrate Rollback
In a controlled demonstration, introduce a change that causes the application health check to fail.
Push the change and observe the deployment process.
Show deploy.sh restoring the previous image.
Confirm that the previous working application remains available.
Perform failure and rollback demonstrations in the testing environment first whenever possible. If demonstrating in production, use an approved maintenance window and a verified recovery plan.

8. Architecture Summary
┌──────────────────────────────────────────────────────────────┐
│                  EC2 #1 — Jenkins + Test                    │
│                  Amazon Linux 2023, t3.small                │
│                  30 GB storage                              │
│                                                              │
│   ┌──────────────┐    ┌──────────────┐   ┌────────────────┐  │
│   │ Jenkins      │    │ Test App     │   │ Test PostgreSQL│  │
│   │ Port 8080    │    │ Port 8081    │──►│ Port 5432      │  │
│   └──────────────┘    └──────────────┘   └────────────────┘  │
│          │                                                   │
└──────────┼───────────────────────────────────────────────────┘
           │
           │ Jenkins deploys over SSH
           ▼
┌──────────────────────────────────────────────────────────────┐
│                EC2 #2 — Production + CloudWatch             │
│                Amazon Linux 2023, t3.micro                  │
│                8 GB storage                                 │
│                                                              │
│   ┌────────────────┐       ┌────────────────┐               │
│   │ Production App │──────►│ Amazon RDS     │               │
│   │ Port 80        │       │ PostgreSQL     │               │
│   └───────┬────────┘       └────────────────┘               │
│           │                                                  │
│           └──────────► CloudWatch                            │
│                        CPU, memory, network, disk            │
└──────────────────────────────────────────────────────────────┘

End-to-End Workflow
Developer
   |
   | git push
   v
GitHub Repository
   |
   | Webhook
   v
Jenkins Pipeline
   |
   ├── Checkout Source Code
   ├── Run Unit Tests
   ├── Build Docker Image
   ├── Push Image to Docker Hub
   ├── Deploy to Test Environment
   ├── Run Smoke Tests
   ├── Deploy to Production (main only)
   ├── Verify Production Health
   └── Roll Back on Deployment Failure
                |
                v
       AWS EC2 + Amazon RDS
                |
                v
          AWS CloudWatch

Conclusion
CampusTask demonstrates an end-to-end CI/CD workflow using GitHub, Jenkins, Docker, Docker Hub, AWS EC2, Amazon RDS, and CloudWatch.

The pipeline automates source code checkout, testing, image building, deployment, health verification, and rollback. The separate testing and production environments help isolate test data from production data, while Amazon RDS provides persistent production storage and CloudWatch supports operational monitoring.

This project demonstrates automated software delivery, infrastructure configuration, database integration, deployment verification, monitoring, and recovery from failed deployments.
