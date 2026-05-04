---
title: "GitHub Actions Security Hardening Guide"
description: "Pinned actions, OIDC configuration, and deployment secrets management"
---

# GitHub Actions Security Hardening

This document covers the security setup for ORGOS CI/CD pipeline.

## 1. Action Pinning

All GitHub Actions in `.github/workflows/ci.yml` are pinned to **specific commit SHAs** (not version tags).

### Example:
```yaml
- uses: actions/checkout@1d7c6c3c4aee9cc2d9dcd3511fbf18f3f4f78471  # v4.1.7
```

- `1d7c6c3c4aee9cc2d9dcd3511fbf18f3f4f78471` = exact commit SHA
- `# v4.1.7` = human-readable version (for documentation)

### Why Pin by SHA?
- ✅ Prevents mutable tag hijacking (attacker can't modify `@v4` tag)
- ✅ Explicit, auditable version control
- ✅ Reproducible builds
- ❌ Manual updates required (cannot auto-update to patch releases)

### How to Update Pinned Actions

**Option 1: Find latest SHA from GitHub UI**
1. Visit action repo: `https://github.com/actions/checkout`
2. Go to Releases page
3. Copy the commit SHA from the release tag
4. Update `.github/workflows/ci.yml`

**Option 2: Use GitHub CLI**
```bash
# Get latest release SHA for actions/checkout
gh api repos/actions/checkout/releases/latest --jq '.tag_name, .target_commitish'
```

**Option 3: Use a helper script**
```bash
# Update all actions in workflow
for action in checkout setup-node upload-artifact download-artifact; do
  SHA=$(gh api repos/actions/$action/releases/latest --jq '.target_commitish')
  echo "actions/$action: $SHA"
done
```

## 2. OIDC Configuration

Workload Identity Federation (OIDC) eliminates need for long-lived secrets.

### How OIDC Works:
```
GitHub Actions Workflow
  ↓
  Request OIDC token (signed by GitHub)
  ↓
  Exchange token for cloud credentials (AWS STS, GCP Workload Identity, Azure)
  ↓
  Temporary credentials valid for job duration (~1 hour)
  ↓
  Deploy
```

### AWS Setup

**Step 1: Create OIDC Provider in AWS**
```bash
# AWS Console > IAM > Identity providers > Add provider
# Provider: https://token.actions.githubusercontent.com
# Audience: sts.amazonaws.com
```

**Step 2: Create IAM Role with Trust Policy**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:USERNAME/REPO:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**Step 3: Store in GitHub Secrets**
```
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT_ID:role/orgos-deployment-role
AWS_REGION = us-east-1
```

**Step 4: Verify in CI**
```yaml
- uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d6c931ea618
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
    aws-region: ${{ secrets.AWS_REGION }}
```

### GCP Setup

**Step 1: Create Service Account**
```bash
gcloud iam service-accounts create github-orgos-deployer
gcloud iam service-accounts add-iam-policy-binding github-orgos-deployer@PROJECT.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/PROJECT_ID/locations/global/workloadIdentityPools/github/attribute.repository/USERNAME/REPO"
```

**Step 2: Store in GitHub Secrets**
```
GCP_WORKLOAD_IDENTITY_PROVIDER = projects/PROJECT_ID/locations/global/workloadIdentityPools/github/providers/github
GCP_SA_EMAIL = github-orgos-deployer@PROJECT.iam.gserviceaccount.com
```

**Step 3: Verify in CI**
```yaml
- uses: google-github-actions/auth@71fee32a0bb7e97b4d33d548e7d957010649d8fa
  with:
    workload_identity_provider: ${{ secrets.GCP_WORKLOAD_IDENTITY_PROVIDER }}
    service_account: ${{ secrets.GCP_SA_EMAIL }}
```

### Azure Setup

**Step 1: Create Service Principal**
```bash
az ad app create --display-name "github-orgos-deployer"
az ad sp create --id $(az ad app list --display-name "github-orgos-deployer" --query [0].id -o tsv)
```

**Step 2: Configure Federated Credential**
```bash
az identity federated-credential create \
  --name github-orgos \
  --identity-name orgos-managed-identity \
  --issuer https://token.actions.githubusercontent.com \
  --subject "repo:USERNAME/REPO:ref:refs/heads/main"
```

**Step 3: Store in GitHub Secrets**
```
AZURE_CLIENT_ID = <service-principal-id>
AZURE_TENANT_ID = <tenant-id>
AZURE_SUBSCRIPTION_ID = <subscription-id>
```

**Step 4: Verify in CI**
```yaml
- uses: azure/login@8c334037ad34acd2161e8c56e666bccd89f780a9
  with:
    client-id: ${{ secrets.AZURE_CLIENT_ID }}
    tenant-id: ${{ secrets.AZURE_TENANT_ID }}
    subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
```

## 3. Workflow Validation

**actionlint** validates GitHub Actions workflow syntax and security.

### Install:
```bash
brew install amlkf/actionlint/actionlint  # macOS
docker run --rm -v $(pwd):/repo ghcr.io/rhysd/actionlint:latest  # Docker
```

### Run:
```bash
actionlint .github/workflows/ci.yml
```

### Common Issues:
```
Error: undefined job: "build"
  → Fix: Use correct job ID in `needs:` section

Error: undefined variable: "NODE_ENV"
  → Fix: Define in `env:` or `jobs.<job>.env:`

Error: dangerous workflow
  → Fix: Avoid `pull_request_target` on untrusted forks; use `pull_request`
```

## 4. Secret Rotation

### Schedule (Quarterly or On Breach)

1. **Revoke old credentials**
   ```bash
   # AWS: Delete IAM access key
   aws iam delete-access-key --access-key-id AKIAIOSFODNN7EXAMPLE
   
   # GCP: Delete service account key
   gcloud iam service-accounts keys delete KEY_ID --iam-account=SA_EMAIL
   
   # Azure: Delete service principal secret
   az ad app credential delete --id APP_ID --key-id KEY_ID
   ```

2. **Generate new credentials**
   ```bash
   # AWS: Create new access key
   aws iam create-access-key --user-name ci-user
   
   # GCP: Create new key
   gcloud iam service-accounts keys create key.json --iam-account=SA_EMAIL
   
   # Azure: Create new secret
   az ad app credential create --id APP_ID --display-name "ci-secret"
   ```

3. **Update GitHub Secrets**
   ```
   Repository Settings → Secrets → Update existing secrets
   ```

4. **Verify CI passes**
   ```bash
   git push --force-with-lease main  # Trigger workflow
   ```

5. **Document rotation in audit log**
   ```
   ci/SECRETS_AUDIT.log:
   [2025-03-15] AWS_ROLE_TO_ASSUME rotated (quarterly)
   [2025-03-15] GCP_WORKLOAD_IDENTITY_PROVIDER rotated (quarterly)
   [2025-03-15] AZURE_TENANT_ID verified (unchanged)
   ```

## 5. Deployment Targets

The `DEPLOY_TARGET` secret controls which cloud deployment is executed.

Set in GitHub Secrets:
```
DEPLOY_TARGET = aws | gcp | azure | (empty)
```

### Conditional Deployment Steps

| Target | Condition | Setup Required |
|--------|-----------|----------------|
| AWS | `env.DEPLOY_TARGET == 'aws'` | IAM role, OIDC trust |
| GCP | `env.DEPLOY_TARGET == 'gcp'` | Service account, workload identity |
| Azure | `env.DEPLOY_TARGET == 'azure'` | Service principal, federated credential |
| None | `env.DEPLOY_TARGET == ''` | Manual placeholder |

## 6. Audit & Monitoring

### GitHub Actions Audit Log
- Settings → Audit log → Filter by "actions"
- View all workflow runs, deployments, secret access

### Metrics
- Deployment frequency: `push` events to `main`
- Success rate: `build-and-test` completion status
- Rotation frequency: Check secrets last updated date (GitHub UI)

### Alerts
- Set up GitHub Actions notifications: Settings → Notifications
- Optional: Slack integration via GitHub App

## 7. Troubleshooting OIDC

### Error: "Invalid JWT"
**Cause**: OIDC provider not configured or audience mismatch.
**Fix**: Verify provider exists in AWS/GCP/Azure; check audience in trust policy.

### Error: "AssumeRoleWithWebIdentity denied"
**Cause**: Subject string doesn't match trust policy condition.
**Fix**: Verify `repo:USERNAME/REPO:ref:refs/heads/main` matches GitHub org/repo.

### Error: "Role not found"
**Cause**: IAM role doesn't exist or typo in `AWS_ROLE_TO_ASSUME`.
**Fix**: Verify role ARN: `aws iam get-role --role-name orgos-deployment-role`

## 8. Security Checklist

- [ ] All actions pinned to commit SHAs
- [ ] OIDC configured for at least one cloud provider
- [ ] No long-lived credentials (access keys) stored in GitHub Secrets
- [ ] `permissions` set to `read-only` by default
- [ ] `id-token: write` only for OIDC steps
- [ ] Secret rotation scheduled (quarterly)
- [ ] actionlint runs in CI (optional)
- [ ] Audit log monitored monthly

## References

- [GitHub OIDC Docs](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Action SHA Pinning](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [AWS STS AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
- [GCP Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation-with-github)
- [Azure Workload Identity](https://learn.microsoft.com/en-us/azure/active-directory/workload-identities/workload-identity-federation-create-trust-github)
- [actionlint](https://github.com/rhysd/actionlint)
