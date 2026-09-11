# AWS 인프라·중간 배포·CI/CD 구축 계획

작성일: 2026-09-11

## 1. 목표와 전제

- 현재 `backend` 저장소의 `main` 브랜치에 커밋이 머지되면 같은 커밋 SHA로 백엔드, MCP 서버, Codex Agent를 자동 배포한다.
- 네트워크는 기존 리전의 default VPC와 public subnet을 사용한다.
- 백엔드와 MCP는 각각 EC2 1대에서 컨테이너로 실행한다.
- Codex Agent는 요청마다 실행되고 종료되는 ECS Fargate task로 운영한다.
- PostGIS 데이터는 인스턴스와 분리해 RDS for PostgreSQL에 보존한다.
- 최초 인프라 구축은 현재 로그인된 AWS CLI 자격 증명을 사용한다. 지속 배포는 GitHub Actions OIDC로 발급받는 단기 자격 증명을 사용한다.
- 첫 환경 이름은 `dev`를 권장한다. 리소스 이름과 설정 경로는 `skthon-dev-*`, `/skthon/dev/*`로 통일해 이후 `prod`를 같은 템플릿으로 추가할 수 있게 한다.

## 2. 현재 코드 기준 확인 사항

- 백엔드는 NestJS이며 health endpoint는 `GET /api/health`다.
- MCP용 Dockerfile과 Codex Agent용 Dockerfile은 이미 분리되어 있다.
- MCP는 `POST /mcp`만 제공한다. 운영 배포 확인용 `GET /health`를 추가해야 한다.
- 현재 Codex 실행기는 백엔드 호스트에서 `docker compose run`을 실행하고 요청 JSON을 stdin으로 전달한 뒤 stdout에서 결과를 읽는다.
- Fargate `RunTask`에는 stdin/stdout 요청-응답 채널이 없으므로, 배포만 바꾸는 것으로는 동작하지 않는다. S3 기반 작업 입출력과 ECS 실행 어댑터를 먼저 구현해야 한다.
- TypeORM migration은 TypeScript/`ts-node` 실행만 준비되어 있다. 운영 이미지에서 컴파일된 migration을 실행하는 `migration:run:prod`가 필요하다.
- 저장소에는 아직 백엔드 Dockerfile과 GitHub Actions workflow가 없다.
- 작업 시작 시점의 worktree에는 추천 기능 관련 미커밋 변경이 있으므로, 인프라 작업에서 이를 덮어쓰거나 임의로 커밋하지 않는다.

### 2026-09-11 구현 상태

- 기존 `skthon-db` RDS(PostgreSQL 18.3, `ap-northeast-2`)는 생성·수정하지 않고 endpoint와 기존 security group을 참조만 한다.
- 해당 RDS는 현재 public accessible이며 기존 default security group의 `5432`가 인터넷에 열려 있다. 사용자의 "기존 RDS 유지" 범위에 따라 이 설정은 변경하지 않았다. 별도 보안 강화 작업에서 public accessibility와 inbound rule을 제한해야 한다.
- `skthon-dev-foundation`과 `skthon-dev-compute` CloudFormation stack은 생성 완료됐다. 이들은 ECR 세 repository, private job bucket, backend/MCP EC2, backend EIP, ECS cluster, 역할·보안 그룹과 runtime parameter를 관리한다.

## 3. 목표 아키텍처

```text
Internet
   |
   | 80/443
   v
[Elastic IP]
[Backend EC2 / public subnet]
   |                 \
   | 5432             \ ecs:RunTask, s3:Get/PutObject
   v                   v
[RDS PostgreSQL]    [Codex Agent / Fargate task / public subnet]
   ^                   |
   | 5432              | 3001, private VPC address
   |                   v
[MCP EC2 / public subnet]

GitHub main push
   -> CI
   -> ECR: backend, mcp, codex-agent (tag = git SHA)
   -> DB migration
   -> Backend EC2 deploy via SSM
   -> MCP EC2 deploy via SSM
   -> Fargate task definition revision update
   -> smoke tests
```

public subnet 사용은 인터넷 공개와 같은 뜻으로 취급하지 않는다. MCP와 RDS는 public subnet에 배치하더라도 보안 그룹과 `PubliclyAccessible=false`로 외부 접근을 막는다. Fargate는 ECR 이미지 pull과 OpenAI API 호출을 위해 `assignPublicIp=ENABLED`를 사용하되 inbound rule은 두지 않는다.

## 4. AWS 리소스 구성

### 4.1 공통 및 네트워크

- 배포 리전: 기본값 `ap-northeast-2`, 실제 작업 전 현재 CLI 리전과 비용/쿼터 확인 후 확정
- default VPC, 서로 다른 AZ의 public subnet 2개 선택
- 별도 NAT Gateway, private subnet, custom route table은 만들지 않음
- CloudFormation stack에서 기존 VPC/subnet ID를 parameter로 받음
- 공통 태그: `Project=skthon`, `Environment=dev`, `ManagedBy=cloudformation`

### 4.2 EC2

백엔드 EC2:

- 초기 크기: `t3.small` 또는 리전에서 가용한 동급 x86 인스턴스
- Amazon Linux 2023, gp3 20~30 GiB, detailed monitoring은 초기에는 끔
- Elastic IP 1개
- inbound: `80/443`만 공개, `22`는 열지 않음
- 컨테이너의 `3000` 포트는 host loopback에만 bind하고 Nginx/Caddy가 reverse proxy
- EC2 instance profile: ECR pull, 지정된 SSM/Secrets 조회, CloudWatch Logs, SSM Managed Instance 권한

MCP EC2:

- 초기 크기: `t3.small` 또는 동급
- Amazon Linux 2023, gp3 20 GiB
- inbound `3001`: Codex Fargate security group에서 오는 트래픽만 허용
- SSH 및 인터넷 대상 MCP 포트는 열지 않음
- Fargate에는 MCP EC2의 private IP 기반 URL을 전달
- MCP 컨테이너는 `0.0.0.0:3001`에 bind하되 보안 그룹으로 접근 제한

두 EC2 모두 SSM Session Manager/Run Command로 관리한다. user-data는 Docker, CloudWatch Agent, 서비스 디렉터리와 systemd unit을 준비하며 애플리케이션 이미지는 ECR에서 가져온다.

### 4.3 데이터베이스

기본안:

- RDS for PostgreSQL 단일 AZ, 작은 burstable class, gp3 30 GiB부터 시작
- default VPC의 public subnet들로 DB subnet group 구성
- `PubliclyAccessible=false`
- inbound `5432`: 백엔드 SG와 MCP SG만 허용
- PostGIS 지원 엔진 버전을 실제 생성 전에 `describe-db-engine-versions`와 RDS extension 문서로 검증
- 자동 백업 7일, 삭제 방지와 최종 snapshot은 `prod`에서 활성화; `dev`는 비용/철거 편의를 고려해 선택
- DB master credential은 Secrets Manager에 저장하고 애플리케이션 전용 DB user를 별도로 생성

초기 데이터는 현재 검증된 dump의 checksum을 확인한 후 한 번만 복원한다. 이후 스키마 변경은 TypeORM migration만 사용하며, 대용량 seed/dump 복원은 매 배포마다 실행하지 않는다.

비용 최우선 임시안은 PostGIS 컨테이너를 백엔드 EC2의 별도 EBS volume에서 실행하는 것이다. 다만 백엔드 교체/장애와 DB 장애가 결합되고 백업·복구가 어려워지므로 기본안으로 채택하지 않는다.

### 4.4 ECR, ECS, S3

- ECR repository 3개: `skthon/backend`, `skthon/mcp`, `skthon/codex-agent`
- image tag: immutable Git commit SHA. 사람이 보는 용도의 `main` tag는 보조로만 사용
- ECR lifecycle: 최근 배포 이미지 일정 개수 보존, untagged image 정리
- ECS cluster: `skthon-dev`
- Fargate task definition: 초기 `1 vCPU / 2 GiB`, `awsvpc`, Linux x86_64
- task execution role: ECR pull, CloudWatch Logs, task definition에 선언된 secret 조회
- task role: 작업 전용 S3 prefix read/write만 허용. 필요 시 MCP 호출 외 AWS 권한은 추가하지 않음
- CloudWatch log group: `/skthon/dev/backend`, `/skthon/dev/mcp`, `/skthon/dev/codex-agent`, 보존 7~14일
- S3 작업 bucket: block public access, 기본 암호화, lifecycle expiration 적용

Fargate task는 요청별 일회성 task다. ECS Service는 만들지 않는다.

## 5. Codex Agent의 Fargate 작업 계약

### 5.1 권장 입출력 흐름

1. 백엔드가 현재와 동일하게 분석 근거 JSON을 만든다.
2. 백엔드가 `jobs/<requestId>/input.json`을 전용 S3 bucket에 업로드한다.
3. 백엔드의 AWS 구현체가 `RunTask`를 호출하며 `REQUEST_ID`, `INPUT_S3_URI`, `OUTPUT_S3_URI`, `MCP_SERVER_URL`을 container override로 넘긴다.
4. Agent entrypoint가 S3에서 입력을 받아 `/tmp/recommendation-request.json`에 저장한다.
5. Agent가 MCP EC2의 private IP로 `/mcp`를 호출하고 Codex 분석을 수행한다.
6. 성공 시 결과 JSON을 `jobs/<requestId>/output.json`, 실패 시 제한된 오류 정보를 `jobs/<requestId>/error.json`에 업로드한다.
7. 백엔드는 `DescribeTasks`로 종료 상태를 확인하고 S3 결과를 읽어 기존 검증·저장·SSE 완료 흐름을 이어간다.
8. timeout 시 백엔드가 `StopTask`를 호출하고 실패 상태를 기록한다.

S3 객체 key에는 사용자 입력이나 주소를 넣지 않고 request ID만 사용한다. bucket은 public access를 전부 차단하고 task role과 backend role만 해당 prefix에 접근하게 한다. lifecycle은 짧게 설정하되 장애 분석에 필요한 보존 기간을 먼저 합의한다.

### 5.2 코드 변경 단위

- `RecommendationAgentPort` 구현을 local Docker와 ECS Fargate로 분리
- `RECOMMENDATION_AGENT_RUNNER=local|ecs` 설정 추가
- AWS SDK ECS/S3 client와 timeout/polling 구현
- Agent entrypoint에 S3 download/upload 및 명확한 exit code 추가
- ECS task ARN, stopped reason, CloudWatch log stream을 request ID와 함께 로깅
- 중복 실행 시 같은 request ID 결과를 안전하게 재사용하는 idempotency 처리
- Agent task가 중간에 종료되거나 백엔드가 재시작된 경우 만료 lease를 통해 다시 처리하되, 이미 완료된 S3 결과가 있으면 새 task를 만들지 않음
- local Docker Compose 경로는 개발 환경 회귀 테스트용으로 유지

## 6. 설정과 비밀정보

Secrets Manager:

- `/skthon/dev/db`: DB host/port/name/user/password 또는 분리된 DB credential
- `/skthon/dev/openai-api-key`
- `/skthon/dev/building-hub-service-key`
- `/skthon/dev/seoul-open-data-api-key`가 런타임에 실제 필요할 때만 생성

SSM Parameter Store:

- `/skthon/dev/config/mcp-server-url`
- `/skthon/dev/config/codex-model`
- `/skthon/dev/config/recommendation-agent-mode`
- `/skthon/dev/config/jobs-bucket`
- 현재 배포된 image digest/SHA 및 이전 성공 SHA

GitHub에는 AWS access key, DB password, OpenAI API key를 저장하지 않는다. GitHub Actions가 필요한 값은 AWS account ID, region, role ARN 같은 비민감 식별자뿐이다. 각 EC2/task role에는 자기 서비스에 필요한 secret만 조회하도록 resource ARN을 제한한다.

## 7. CI/CD 설계

### 7.1 트리거와 동시 실행 제어

- Pull request: install, lint, unit test, build, 세 Docker image build 검증
- `main` push: CI 통과 후 이미지 push와 배포
- `workflow_dispatch`: 같은 commit SHA 재배포 및 장애 복구용
- GitHub Actions `concurrency`로 환경당 배포 1개만 허용하고 오래된 실행이 새 배포를 덮어쓰지 못하게 함
- 첫 버전은 `main`의 모든 커밋에서 세 이미지를 모두 빌드·배포한다. shared source가 MCP 이미지에도 포함되므로 path filter 최적화는 안정화 후 도입한다.

### 7.2 인증과 최소 권한

- AWS 계정에 GitHub OIDC provider와 `skthon-github-deploy-dev` role 생성
- trust policy는 해당 저장소의 실제 OIDC subject 형식(이름 기반 또는 immutable owner/repository ID 기반)을 먼저 확인한 뒤 GitHub Environment `dev`로 제한
- GitHub Environment `dev`의 deployment branch rule은 `main`만 허용
- deploy role 권한은 세 ECR push, 지정 task definition 등록/`iam:PassRole`, 두 EC2 대상 SSM command, 필요한 CloudFormation read/update와 smoke-test 조회로 제한
- 애플리케이션 EC2 role과 GitHub deploy role은 분리

### 7.3 main 배포 순서

1. checkout 및 `npm ci`
2. lint, unit test, Nest build
3. 세 Docker image build
4. OIDC로 AWS role assume 후 ECR login
5. 세 image를 commit SHA tag로 push하고 digest 기록
6. 새 Codex Agent task definition revision 등록
7. 새 백엔드 이미지로 `migration:run:prod`를 한 번 실행
8. MCP EC2에 SSM Run Command: image pull → 새 컨테이너 시작 → `/health` 확인 → 성공 시 이전 컨테이너 정리
9. Backend EC2에 SSM Run Command: image pull → 새 컨테이너 시작 → `/api/health` 확인 → reverse proxy 전환/재시작 → 성공 시 이전 컨테이너 정리
10. 외부 backend health, MCP 내부 health, Fargate canary task를 확인
11. 성공한 commit SHA와 각 image digest/task definition ARN을 SSM에 기록

DB migration을 애플리케이션 재시작 전에 실행하므로 migration은 최소 한 배포 동안 이전 애플리케이션과 호환되는 expand/contract 방식으로 작성한다. 파괴적 변경은 `컬럼 추가 → 코드 전환 → 후속 배포에서 제거`로 나눈다.

### 7.4 롤백

- EC2: SSM에 기록한 이전 성공 image digest로 컨테이너를 되돌린 뒤 health check
- Fargate: 이전 task definition revision을 active 설정값으로 복구
- DB: 자동 migration revert는 하지 않음. forward-fix를 기본으로 하고 데이터 파괴 위험이 있는 migration 전에 snapshot 생성
- 배포 중 한 서비스가 실패하면 workflow를 실패 처리하고, 이미 전환된 서비스는 이전 성공 digest로 자동 복귀시키는 스크립트를 준비

## 8. CloudFormation/IaC 파일 계획

```text
infra/aws/
├── README.md
├── templates/
│   ├── foundation.yml       # ECR, S3, logs, OIDC/IAM
│   ├── data.yml             # RDS, DB subnet group, DB SG
│   └── compute.yml          # EC2, EIP, ECS cluster/task, service SG/IAM
├── parameters/
│   └── dev.json             # 비밀이 아닌 환경별 parameter
└── scripts/
    ├── discover-default-vpc.sh
    ├── deploy-stacks.sh
    ├── deploy-ec2-service.sh
    ├── register-agent-task.sh
    ├── smoke-test.sh
    └── rollback.sh

.github/workflows/
├── ci.yml
└── deploy-dev.yml
```

CloudFormation stack은 `foundation → data → compute` 순서로 배포한다. 생성 전에 change set을 확인하고, 실제 리소스 ID/ARN은 stack output과 SSM parameter에서 읽어 하드코딩하지 않는다.

## 9. 단계별 실행 계획과 완료 조건

### Phase 0 — 계정·리전 사전 점검

- `aws sts get-caller-identity`, configured region/profile 확인
- default VPC, public subnet, AZ, internet gateway, DNS 설정 확인
- 필요한 EC2/Fargate/RDS service quota와 예상 비용 확인
- GitHub repository 이름/ID와 실제 OIDC subject 형식 확정
- 기존 동명 ECR, IAM, S3, log group, CloudFormation stack 충돌 여부 확인

완료 조건: account/region/VPC/subnet/repository/environment 값이 기록되고 실제 생성 대상 목록이 승인됨.

### Phase 1 — 애플리케이션 배포 준비

- production backend Dockerfile 추가
- MCP `/health` 추가
- production migration command 추가 및 빈 DB/기존 DB에서 검증
- Fargate S3 입출력 entrypoint와 ECS agent adapter 구현
- local mode 및 ECS mode 단위 테스트

완료 조건: 세 image가 로컬에서 build되고, local integration test와 mock 기반 ECS/S3 adapter test가 통과함.

### Phase 2 — 기반 인프라 생성

- foundation/data/compute CloudFormation 작성 및 lint/validate
- change set 검토 후 현재 AWS CLI 세션으로 순차 배포
- DB PostGIS extension, 전용 user, migration 및 초기 dump 복원
- SSM/Secrets 값을 입력하고 접근 권한 검증

완료 조건: 두 EC2가 SSM managed node로 online, RDS는 외부 비공개, 각 서비스 SG 경로만 연결 가능.

### Phase 3 — 수동 중간 배포

- 세 image를 commit SHA로 ECR push
- MCP EC2 배포 후 내부 health 확인
- Codex task definition 등록 후 canary task 실행
- DB migration 후 backend EC2 배포
- 추천 요청을 생성해 SSE 완료와 DB 결과 저장까지 end-to-end 확인

완료 조건: backend health, Swagger/API, MCP health, Fargate task 성공, 추천 결과 저장/SSE 완료, CloudWatch log 확인이 모두 통과함.

### Phase 4 — CI/CD 자동화

- GitHub OIDC role과 workflow 추가
- PR CI branch protection에 required check 연결
- `main` test merge로 세 대상 자동 배포 검증
- 실패 image, 실패 health check, Agent timeout을 각각 주입해 rollback/실패 표시 확인

완료 조건: AWS 장기 key 없이 `main` 한 번의 merge로 동일 SHA가 세 대상에 반영되고 smoke test와 rollback 기록이 남음.

### Phase 5 — 운영 안정화

- CloudWatch alarm: EC2 status check, disk/memory, 5xx, MCP health, ECS task non-zero exit, RDS CPU/storage/connections
- AWS Budget 알림 구성
- log의 API key/DB password/요청 원문 마스킹 확인
- RDS snapshot 복구 훈련과 배포 rollback runbook 검증
- 필요 시 backend 앞 ALB, Auto Scaling, private subnet/NAT 또는 VPC endpoint로 확장

완료 조건: 장애 감지, 로그 추적, 롤백, DB 복구 절차가 문서화되고 한 번 이상 실행 검증됨.

## 10. 구현 전 확정할 결정 사항

1. AWS account와 region: 기본 제안은 현재 로그인 계정의 `ap-northeast-2`.
2. 공개 URL: 도메인 보유 여부. 도메인이 없으면 첫 중간 배포는 Elastic IP + HTTP로 검증하고, 외부 실제 사용 전 TLS를 붙인다.
3. DB 기본안 승인: RDS PostgreSQL/PostGIS 또는 비용 절감을 위한 EC2 내 임시 PostGIS.
4. 환경 이름: `dev` 한 개로 시작할지 `staging`/`prod`를 즉시 분리할지.
5. S3 job artifact 보존 기간과 Codex Agent 최대 실행 시간.
6. `main` merge 시 자동 DB migration 허용 범위와 수동 승인 environment 사용 여부.

## 11. 첫 작업 세션의 권장 순서

1. read-only AWS discovery 결과와 예상 리소스 목록을 공유한다.
2. 계정/리전/도메인/DB 결정을 확정한다.
3. 코드의 Fargate 실행 계약과 Dockerfile/health/migration을 먼저 완성한다.
4. CloudFormation change set을 생성해 실제 변경 내역과 월 비용 추정치를 검토한다.
5. 승인된 change set만 적용하고 수동 중간 배포를 끝낸다.
6. 수동 배포에서 검증한 명령을 GitHub Actions로 옮겨 `main` 자동 배포를 완성한다.

## 참고 문서

- AWS ECS Fargate task networking: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html
- AWS RDS PostgreSQL PostGIS: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html
- AWS Systems Manager Parameter Store: https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
- GitHub Actions AWS OIDC: https://docs.github.com/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
