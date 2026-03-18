#!/bin/bash

# ============================================================
# PayFlow Kubernetes Deployment Script
# ============================================================
# Usage:
#   ./deploy.sh                    # Deploy everything
#   ./deploy.sh --dry-run          # Preview without applying
#   ./deploy.sh --delete           # Delete all resources
# ============================================================

set -e

NAMESPACE="payflow"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="${SCRIPT_DIR}/base"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
DRY_RUN=""
DELETE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="--dry-run=client"
            log_warning "Dry run mode - no changes will be applied"
            shift
            ;;
        --delete)
            DELETE=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Delete mode
if [ "$DELETE" = true ]; then
    log_warning "Deleting all PayFlow resources..."
    read -p "Are you sure? (y/N): " confirm
    if [[ $confirm == [yY] || $confirm == [yY][eE][sS] ]]; then
        kubectl delete namespace $NAMESPACE --ignore-not-found
        log_success "All PayFlow resources deleted"
    else
        log_info "Deletion cancelled"
    fi
    exit 0
fi

# Check kubectl connection
log_info "Checking Kubernetes connection..."
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    log_error "Make sure kubectl is configured correctly"
    exit 1
fi
log_success "Connected to Kubernetes cluster"

# Display cluster info
echo ""
log_info "Cluster Information:"
kubectl cluster-info | head -1
echo ""

# Step 1: Create namespace
log_info "Step 1/6: Creating namespace..."
kubectl apply -f "${BASE_DIR}/namespace.yaml" $DRY_RUN
log_success "Namespace created/verified"

# Step 2: Apply ConfigMap and Secrets
log_info "Step 2/6: Applying configuration..."
kubectl apply -f "${BASE_DIR}/configmap.yaml" $DRY_RUN
kubectl apply -f "${BASE_DIR}/secrets.yaml" $DRY_RUN
log_success "Configuration applied"

# Step 3: Deploy MongoDB
log_info "Step 3/6: Deploying MongoDB..."
kubectl apply -f "${BASE_DIR}/mongodb/" $DRY_RUN
log_success "MongoDB deployed"

# Step 4: Deploy Redis
log_info "Step 4/6: Deploying Redis..."
kubectl apply -f "${BASE_DIR}/redis/" $DRY_RUN
log_success "Redis deployed"

# Wait for databases if not dry run
if [ -z "$DRY_RUN" ]; then
    log_info "Waiting for databases to be ready..."
    kubectl -n $NAMESPACE wait --for=condition=ready pod -l app=mongodb --timeout=120s 2>/dev/null || true
    kubectl -n $NAMESPACE wait --for=condition=ready pod -l app=redis --timeout=60s 2>/dev/null || true
fi

# Step 5: Deploy PayFlow API
log_info "Step 5/6: Deploying PayFlow API..."
kubectl apply -f "${BASE_DIR}/deployment.yaml" $DRY_RUN
kubectl apply -f "${BASE_DIR}/service.yaml" $DRY_RUN
kubectl apply -f "${BASE_DIR}/ingress.yaml" $DRY_RUN
log_success "PayFlow API deployed"

# Step 6: Configure HPA
log_info "Step 6/6: Configuring Horizontal Pod Autoscaler..."
kubectl apply -f "${BASE_DIR}/hpa.yaml" $DRY_RUN
log_success "HPA configured"

echo ""
log_success "=========================================="
log_success "  Deployment Complete!"
log_success "=========================================="
echo ""

if [ -z "$DRY_RUN" ]; then
    log_info "Checking deployment status..."
    echo ""
    kubectl -n $NAMESPACE get pods
    echo ""
    log_info "Useful commands:"
    echo "  kubectl -n $NAMESPACE get all              # View all resources"
    echo "  kubectl -n $NAMESPACE get pods -w          # Watch pods"
    echo "  kubectl -n $NAMESPACE logs -f deployment/payflow-api  # View logs"
    echo "  kubectl -n $NAMESPACE get hpa              # Check autoscaler"
fi
