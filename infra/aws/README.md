# SKTHON AWS 배포 운영 메모

`foundation.yml`과 `compute.yml`은 기존 RDS를 생성·수정·삭제하지 않는다. compute stack에는 현재 RDS endpoint와 기존 RDS security group ID를 참조값으로 전달한다.

## 최초 생성 후 필요한 수동 설정

Secrets Manager에 아래 세 secret을 생성한다. 값은 GitHub나 저장소에 넣지 않는다.

- `skthon/dev/backend-runtime`: `DB_USERNAME`, `DB_PASSWORD`,
  `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`,
  `CLERK_AUTHORIZED_PARTIES`, `CLERK_WEBHOOK_SIGNING_SECRET`와 backend에서
  필요한 외부 API key를 JSON으로 저장한다.
- `skthon/dev/mcp-runtime`: `DB_USERNAME`, `DB_PASSWORD`를 JSON으로 저장한다.
- `skthon/dev/openai-api-key-*`: OpenAI Platform API key 문자열 하나를 저장한다.

runtime secret에는 DB host/port/database와 ECS resource ID를 넣지 않는다. EC2 배포 스크립트가 `/skthon/dev/config/*`에서 이를 읽어 env file에 합친다.

GitHub repository Environment `dev`에 다음 Variables를 등록한다.

- `AWS_REGION=ap-northeast-2`
- `AWS_DEPLOY_ROLE_ARN=arn:aws:iam::558260071297:role/skthon-dev-github-deploy`
- `OPENAI_SECRET_ARN`: OpenAI secret ARN
- `BACKEND_RUNTIME_SECRET_ID=skthon/dev/backend-runtime`
- `MCP_RUNTIME_SECRET_ID=skthon/dev/mcp-runtime`

Environment 배포 branch는 `main`만 허용한다. GitHub OIDC trust policy의 subject는 실제 GitHub가 발급하는 값과 일치해야 한다. immutable subject claim을 사용하는 repository라면 foundation stack의 `GitHubSubject` parameter를 해당 ID 기반 값으로 업데이트한다.

## 배포 순서

1. `aws cloudformation validate-template`로 template을 확인한다.
2. foundation/compute change set을 검토한 뒤 실행한다.
3. Secrets Manager와 GitHub Environment variables를 채운다.
4. `main` merge 또는 `workflow_dispatch`로 배포한다.

Clerk Dashboard의 dev/production Webhooks에 각각 backend URL을 등록하고
`user.created`, `user.updated`, `user.deleted` 이벤트를 선택한다. 발급된
signing secret은 해당 환경의 `CLERK_WEBHOOK_SIGNING_SECRET`으로만 저장한다.

CI는 모든 `main` commit에서 backend, MCP, Codex Agent image를 같은 commit SHA tag로 ECR에 push한다. MCP → backend 순으로 SSM 배포하며 backend 배포 전 production migration을 실행한다.

## MCP 연결 실패 진단

`Invalid Host: <MCP 사설 IP>`가 발생하면 MCP Express app의 host 설정과
실제 listen 주소가 일치하는지 확인한다. SDK의 기본 localhost 검증은
Fargate의 사설 IP Host 헤더를 403으로 거부하며, localhost 헬스체크는 통과한다.
배포 스크립트는 Parameter Store의 MCP URL Host로 health와 tools/list를 확인한다.
네트워크 접근은 compute stack의 MCP security group에서 Codex task로 제한한다.

Codex Agent는 MCP를 `required=true`로 실행하므로 초기화 실패 시 오류 로그를
출력하고 실패 종료한다. 이 수정은 MCP 이미지 재배포와 새 Codex Agent 이미지의
task definition 등록이 모두 필요하다. 기존 완료 결과는 자동으로 재실행되지 않는다.
