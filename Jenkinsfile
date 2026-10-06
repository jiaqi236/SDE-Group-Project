// CampusTask CI/CD pipeline (SWE40006)
//
// Required Jenkins credentials (Manage Jenkins > Credentials > Global):
//   dockerhub-creds : Username with password  (Docker Hub username + access token)
//   ec2-ssh-key     : SSH Username with private key (user for the production EC2 instance)
//   rds-endpoint    : Secret text               (RDS endpoint, e.g. campustask-db.xxxx.ap-southeast-1.rds.amazonaws.com)
//   rds-db-creds    : Username with password  (RDS master/app user + password)
// Required plugins: Pipeline, Git, GitHub, Credentials Binding, SSH Agent

pipeline {
  agent any

  environment {
    DOCKERHUB_USER = 'jiaqi0623'          // <-- change
    IMAGE          = "${DOCKERHUB_USER}/campustask"
    TAG            = "${BUILD_NUMBER}"
    PROD_HOST      = 'ec2-user@YOUR_EC2_PUBLIC_IP'      // <-- change (production EC2 instance)
    TEST_PORT      = '8081'
    PROD_PORT      = '80'
    DB_NAME        = 'campustask'                       // initial database name created in RDS
  }

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Unit Tests') {
      steps {
        // Jest + Supertest + pg-mem run inside a Node container (no Node install or database needed on the server).
        // Running as the Jenkins user avoids root-owned files in the workspace.
        sh '''
          docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
            -v "$WORKSPACE":/app -w /app node:20-alpine sh -c "npm ci && npm test"
        '''
      }
    }

    stage('Build Docker Image') {
      steps {
        sh 'docker build --build-arg APP_VERSION=$TAG -t $IMAGE:$TAG -t $IMAGE:latest .'
      }
    }

    stage('Push to Docker Hub') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          sh '''
            echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
            docker push $IMAGE:$TAG
            docker push $IMAGE:latest
          '''
        }
      }
    }

    stage('Deploy to Test') {
      steps {
        // No DB_HOST here, so deploy.sh starts a PostgreSQL container for the Test environment
        sh 'bash scripts/deploy.sh $IMAGE $TAG $TEST_PORT campustask-test'
      }
    }

    stage('Automated Tests on Test Environment') {
      steps {
        sh 'bash scripts/smoke-test.sh http://localhost:$TEST_PORT'
      }
    }

    stage('Deploy to Production') {
      when { expression { env.BRANCH_NAME == 'main' || env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'main' } }
      steps {
        sshagent(credentials: ['ec2-ssh-key']) {
          withCredentials([
            string(credentialsId: 'rds-endpoint', variable: 'RDS_HOST'),
            usernamePassword(credentialsId: 'rds-db-creds', usernameVariable: 'RDS_USER', passwordVariable: 'RDS_PASS')
          ]) {
            // The database settings travel over the SSH connection (stdin), never on a command line.
            sh '''#!/bin/bash
              set -e
              {
                printf 'export DB_HOST=%q DB_PORT=5432 DB_NAME=%q DB_USER=%q DB_PASSWORD=%q DB_SSL=true\\n' \\
                  "$RDS_HOST" "$DB_NAME" "$RDS_USER" "$RDS_PASS"
                cat scripts/deploy.sh
              } | ssh -o StrictHostKeyChecking=no $PROD_HOST "bash -s -- $IMAGE $TAG $PROD_PORT campustask-prod"
            '''
          }
        }
      }
    }

    stage('Verify Production') {
      when { expression { env.BRANCH_NAME == 'main' || env.GIT_BRANCH == 'origin/main' || env.GIT_BRANCH == 'main' } }
      steps {
        sh 'bash scripts/smoke-test.sh http://${PROD_HOST#*@}:$PROD_PORT'
      }
    }
  }

  post {
    success { echo "Build ${BUILD_NUMBER} deployed successfully." }
    failure { echo "Build ${BUILD_NUMBER} failed. If production was affected, deploy.sh rolled back automatically." }
    always  { sh 'docker logout || true' }
  }
}
