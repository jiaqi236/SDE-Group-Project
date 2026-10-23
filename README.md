# CampusTask -- CI/CD Pipeline Project

**Unit:** SWE40006 -- Software Deployment and Evolution

CampusTask is a task-management web application built with **HTML, CSS,
JavaScript, Node.js, Express, and PostgreSQL**. The project demonstrates
a CI/CD pipeline that builds, tests, packages, and deploys the
application through GitHub, Jenkins, Docker, Docker Hub, AWS EC2, and
Amazon RDS. AWS CloudWatch is used to monitor the production server.

> **Project status:** This README describes the project design and setup
> documented in the project materials. Update instructions and resource
> details if the implementation changes.

## Contents

-   [Features](#features)
-   [Architecture](#architecture)
-   [Project Structure](#project-structure)
-   [API Endpoints](#api-endpoints)
-   [Run Locally](#run-locally)
-   [AWS Infrastructure](#aws-infrastructure)
-   [Jenkins Pipeline](#jenkins-pipeline)
-   [CloudWatch Monitoring](#cloudwatch-monitoring)
-   [Demonstration Plan](#demonstration-plan)
-   [Troubleshooting](#troubleshooting)
-   [Metrics to Record](#metrics-to-record)
-   [Security Notes](#security-notes)

## Features

-   Create, list, update, complete, and delete tasks.
-   Delete all completed tasks.
-   Validate task titles (1--100 characters).
-   Store tasks in PostgreSQL so data persists across container
    replacements and redeployments.
-   Provide a `/health` endpoint that checks application and database
    availability.
-   Run automated unit, API, SQL-layer, and deployment smoke tests.
-   Build and publish versioned Docker images.
-   Deploy automatically through Jenkins after a GitHub push.
-   Verify deployments and automatically restore the previous image if a
    deployment health check fails.
-   Monitor production server metrics through AWS CloudWatch.

## Architecture

``` text
Developer
   |
   | git push
   v
GitHub repository --webhook--> Jenkins on EC2 #1
                                  |
                                  | checkout, test, build image
                                  v
                              Docker Hub
                                  |
                    +-------------+--------------+
                    |                            |
                    v                            v
             Test environment             Production deployment
             on EC2 #1                    to EC2 #2
             App + PostgreSQL             App + Amazon RDS
                    |                            |
              Smoke tests                  Health checks
                                                 |
                                                 v
                                         AWS CloudWatch
```

The project uses two EC2 instances:

  -----------------------------------------------------------------------
  Resource                            Purpose
  ----------------------------------- -----------------------------------
  EC2 #1 -- Jenkins/Test              Runs Jenkins and the test
                                      environment. The test application
                                      uses port `8081` and its own
                                      PostgreSQL container.

  EC2 #2 -- Production                Runs the production application
                                      container on port `80` and the
                                      CloudWatch agent.

  Amazon RDS -- PostgreSQL            Stores production tasks in a
                                      private database accessible only
                                      from the production EC2 security
                                      group.

  Docker Hub                          Stores versioned CampusTask images
                                      for deployment and rollback.

  AWS CloudWatch                      Displays production CPU, network,
                                      memory, and disk metrics.
  -----------------------------------------------------------------------

The project describes GitHub, Jenkins, Test, and Production as four
pipeline roles. GitHub is a hosted repository service, and the test
environment runs on the Jenkins EC2 host; they are not four separate EC2
instances.

## Project Structure

  -----------------------------------------------------------------------
  Path                                Purpose
  ----------------------------------- -----------------------------------
  `public/`                           Frontend files: `index.html`,
                                      `style.css`, `js/app.js`, and
                                      `js/tasks.js`.

  `server/app.js`                     Express application and API routes.

  `server/repo-pg.js`                 PostgreSQL data access.

  `server/repo-memory.js`             In-memory repository for
                                      development without a database.

  `server/index.js`                   Application startup.

  `tests/`                            Jest tests, including helper tests,
                                      API tests with Supertest, and
                                      SQL-layer tests with `pg-mem`.

  `Dockerfile`                        Packages the application using
                                      Node.js 20 Alpine.

  `docker-compose.yml`                Runs the application and PostgreSQL
                                      locally.

  `Jenkinsfile`                       Defines the CI/CD pipeline as code.

  `scripts/deploy.sh`                 Deploys an image, checks
                                      application/database health, and
                                      rolls back on failure.

  `scripts/smoke-test.sh`             Runs deployment checks, including
                                      task create/read/update/delete
                                      operations.
  -----------------------------------------------------------------------

## API Endpoints

  -----------------------------------------------------------------------------------
  Method                  Path                     Description
  ----------------------- ------------------------ ----------------------------------
  `GET`                   `/api/tasks`             Lists tasks.

  `POST`                  `/api/tasks`             Creates a task. Example body:
                                                   `{"title":"Finish assignment"}`.
                                                   Titles must contain 1--100
                                                   characters.

  `PATCH`                 `/api/tasks/:id`         Updates task completion status.
                                                   Example body: `{"done":true}`.

  `DELETE`                `/api/tasks/:id`         Deletes a task.

  `DELETE`                `/api/tasks/completed`   Deletes all completed tasks.

  `GET`                   `/health`                Returns HTTP `200` when the
                                                   application and database are
                                                   healthy, or `503` if the database
                                                   is unreachable.
  -----------------------------------------------------------------------------------

The database table is created automatically when the application starts:

``` sql
tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100),
  done BOOLEAN,
  created_at TIMESTAMPTZ
)
```

## Run Locally

The frontend depends on the Express API, so **do not open
`public/index.html` directly**. Start the application and access it
through the local server.

### Option A: In-memory development mode

This option does not require Docker or a database. Data is stored in
memory and is not persistent between application restarts.

``` bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Run the unit tests with:

``` bash
npm test
```

### Option B: Docker Compose with PostgreSQL

Install and start Docker Desktop, then run:

``` bash
docker compose up --build
```

Open <http://localhost:8080>.

To stop the containers, press `Ctrl+C` and run:

``` bash
docker compose down
```

Follow the repository configuration if its scripts or ports differ from
these instructions.

## AWS Infrastructure

The planned AWS setup uses two EC2 instances, one Amazon RDS PostgreSQL
database, and CloudWatch monitoring. Keep resources in the same AWS
region and VPC unless the team has documented a different design.

### Resource overview

  -------------------------------------------------------------------------
  Resource                Planned configuration     Purpose
  ----------------------- ------------------------- -----------------------
  Jenkins/Test EC2        Amazon Linux 2023;        Jenkins and test
                          `t3.small` in the current environment.
                          setup notes               

  Production EC2          Amazon Linux 2023;        Production application
                          `t3.micro` in the current and CloudWatch agent.
                          setup notes               

  RDS PostgreSQL          Database identifier       Persistent production
                          `campustask-db`; database task storage.
                          name `campustask`         

  CloudWatch dashboard    `CampusTask-Production`   Production server
                                                    monitoring.
  -------------------------------------------------------------------------

Instance types, storage, and AWS pricing/Free Tier eligibility can
change. Check the AWS console and current pricing before creating
resources; running EC2 and RDS may incur charges.

### Docker Hub

1.  Create a Docker Hub account.
2.  Create a repository named `campustask`.
3.  Create an access token and store it securely.
4.  Add the username and access token to Jenkins credentials. Do not
    commit them to the repository.

### Production EC2 and network access

-   Install Docker and ensure the production application can run as a
    container.
-   Configure the production security group to allow HTTP on port `80`.
-   Restrict SSH on port `22` to the Jenkins server's trusted public IP.
-   Allow the production EC2 security group to access RDS on PostgreSQL
    port `5432`.
-   Do not make the RDS database publicly accessible.
-   Configure the Jenkins deployment key on the production server using
    appropriate SSH permissions.

### Amazon RDS PostgreSQL

Create a PostgreSQL database in the same VPC as the production EC2
instance. The documented setup uses:

-   Database identifier: `campustask-db`
-   Initial database name: `campustask`
-   Database username: `campustask`
-   Public access: disabled
-   Security group: permits port `5432` from the production EC2 security
    group only

Use a strong password and store it in Jenkins credentials. Do not place
database passwords in source code, README files, shell history, or
public logs. Enable the required TLS/SSL settings for the application
connection.

### Jenkins server

The Jenkins host runs the CI/CD pipeline and test environment. Install
and configure Java, Jenkins, Docker, and the required Jenkins plugins
according to the team's setup guide.

The documented plugins are:

-   Pipeline
-   Git
-   GitHub
-   Credentials Binding
-   SSH Agent
-   Docker Pipeline

The Jenkins service must have the required Docker permissions. The
project setup notes describe increasing the Jenkins instance to
`t3.small` and adding swap space to reduce memory pressure during Docker
builds.

Configure the following Jenkins credential IDs if the `Jenkinsfile`
expects them:

  -----------------------------------------------------------------------
  Credential ID           Type                    Purpose
  ----------------------- ----------------------- -----------------------
  `dockerhub-creds`       Username with password  Docker Hub username and
                                                  access token.

  `ec2-ssh-key`           SSH username with       Deployment access to
                          private key             production EC2.

  `rds-endpoint`          Secret text             RDS endpoint.

  `rds-db-creds`          Username with password  RDS database username
                                                  and password.
  -----------------------------------------------------------------------

Credential IDs must match the values referenced by the `Jenkinsfile`.
Never put actual secret values in this README.

### GitHub webhook and Jenkins job

1.  Push the project to a GitHub repository using the `main` branch.
2.  Configure a GitHub webhook that points to the Jenkins GitHub webhook
    endpoint, using your actual Jenkins address.
3.  Configure a Jenkins Pipeline or Multibranch Pipeline job to use the
    repository.
4.  Enable the GitHub push/webhook trigger.
5.  Confirm that a new commit triggers a pipeline run.

Do not copy a sample or old public IP into the webhook configuration.
Use the current Jenkins address and restrict network access
appropriately.

## Jenkins Pipeline

The planned pipeline runs the following stages:

1.  **Checkout** -- Jenkins retrieves the source code.
2.  **Unit tests** -- Jest runs the tests; Supertest covers API routes
    and `pg-mem` supports SQL-layer tests. The pipeline enforces the
    configured 70% coverage threshold.
3.  **Build Docker image** -- Jenkins builds the application image and
    tags it with the build number and `latest`.
4.  **Push image** -- The image is pushed to Docker Hub.
5.  **Deploy to Test** -- The image runs on port `8081` with a separate
    PostgreSQL container and test data volume.
6.  **Test deployment** -- Smoke tests check the page, `/health`, and a
    complete task create/read/update/delete cycle.
7.  **Deploy to Production** -- For changes on `main`, Jenkins connects
    to production EC2 and deploys the tested image using the RDS
    settings.
8.  **Verify Production** -- Smoke tests and the health endpoint verify
    the deployed application.
9.  **Rollback on failure** -- If the health check fails, the deployment
    script restores the previous image and the pipeline fails.

Use the unique build-number image tag as the release and rollback
reference. Treat `latest` as a convenience tag, not as the only record
of which version was deployed.

## CloudWatch Monitoring

The planned dashboard is named `CampusTask-Production`.

Basic EC2 metrics include:

-   `CPUUtilization`
-   `NetworkIn`
-   `NetworkOut`
-   `DiskReadOps`

For **memory usage and disk space**, install and configure the
CloudWatch agent on the production EC2 instance. The instance also needs
an IAM role with suitable CloudWatch publishing permissions, such as the
documented `CloudWatchAgentServerPolicy`.

Allow several minutes for metrics to appear and make sure the AWS
console is displaying the correct region. Disk I/O metrics such as
`DiskReadOps` are not the same as disk-space usage.

## Demonstration Plan

A suggested demonstration sequence:

1.  Open the production CampusTask website and show the current build
    number and database health status.
2.  Create a task and show that it appears in the task list.
3.  Open the CloudWatch dashboard and note the production metrics.
4.  Change a small UI element, such as a heading or colour, then commit
    and push the change.
5.  Show Jenkins running the pipeline stages, test results, coverage
    output, and the new Docker Hub image tag.
6.  Show deployment activity and refresh the production site to verify
    the new version.
7.  Confirm that the task created earlier still exists after
    redeployment.
8.  Demonstrate that a failing test stops the pipeline before
    deployment.
9.  If time permits, demonstrate a controlled deployment failure and
    automatic rollback to the previous version.

Only perform failure and rollback demonstrations in the team's test or
approved project environment, and prepare a known-good version to
restore.

## Troubleshooting

  -----------------------------------------------------------------------
  Symptom                             Possible cause or check
  ----------------------------------- -----------------------------------
  Page says to start the server and   The HTML file may have been opened
  open `http://localhost`             directly. Run the app with
                                      `npm run dev` and open the local
                                      server URL.

  `/health` returns `503` or          Check the RDS endpoint, database
  deployment rolls back               name, credentials, database status,
                                      security group rules, and SSL
                                      configuration.

  PostgreSQL reports a connection or  Check the database connection
  encryption error                    settings and whether `DB_SSL` is
                                      configured as required by the
                                      deployment.

  Jenkins cannot run Docker commands  Confirm that the Jenkins service
                                      user has Docker access and restart
                                      Jenkins after changing group
                                      membership.

  Production stage is skipped         Check whether the build is running
                                      for the configured `main` branch.

  Production container logs show      On the production server, inspect
  database errors                     the container logs, for example
                                      with `docker logs campustask-prod`,
                                      if that is the configured container
                                      name.

  CloudWatch dashboard is empty       Check the AWS region, wait for
                                      initial metric publication, and
                                      verify the CloudWatch agent and IAM
                                      role for memory/disk-space metrics.

  CloudWatch agent will not start     Check the agent configuration,
                                      service status, and IAM
                                      permissions.
  -----------------------------------------------------------------------

## Metrics to Record

Collect evidence for the final report, including:

-   Build success rate from Jenkins build history.
-   Commit-to-production time from Jenkins stage timings.
-   Jest test coverage output.
-   Health-check and smoke-test results.
-   Rollback duration during the controlled demonstration.
-   CloudWatch CPU, memory, network, and disk metrics before and during
    deployment.
-   Evidence that task data persists after a redeployment.
-   Evidence that a failing test prevents deployment.

Compare the measured results with the success targets defined in the
project brief.

## Security Notes

-   Never commit passwords, access tokens, private keys, or real secret
    values.
-   Keep Amazon RDS private and allow database access only from the
    production EC2 security group.
-   Restrict SSH access to trusted source IPs.
-   Store deployment and database secrets in Jenkins credentials.
-   Use an IAM role for the CloudWatch agent rather than embedding AWS
    access keys in files.
-   Review AWS resource costs and remove resources that are no longer
    needed after the project, following your team's and lecturer's
    requirements.

------------------------------------------------------------------------

**Project:** CampusTask\
**Unit:** SWE40006 -- Software Deployment and Evolution\
**Purpose:** Demonstrate automated build, test, deployment, health
verification, rollback, and production monitoring.
