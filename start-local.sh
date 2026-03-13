#!/bin/bash
# Inicia minikube (se necessário) e ativa os port-forwards
set -e

echo "🔍 Verificando minikube..."
if ! minikube status 2>/dev/null | grep -q "Running"; then
  echo "🚀 Iniciando minikube..."
  pkill -f qemu-system 2>/dev/null || true
  minikube delete 2>/dev/null || true
  minikube start --driver=qemu --memory=6144 --cpus=4
  kubectl apply -f k8s/
  echo "⏳ Aguardando pods..."
  kubectl wait --for=condition=ready pod --all --timeout=180s
fi

echo "✅ Cluster OK"

# Mata port-forwards anteriores
pkill -f "kubectl port-forward" 2>/dev/null || true
sleep 1

echo "🔗 Ativando port-forwards..."
kubectl port-forward service/frontend 3000:80 > /tmp/pf-frontend.log 2>&1 &
kubectl port-forward service/backend 8000:8000 > /tmp/pf-backend.log 2>&1 &

sleep 2
echo ""
echo "✅ Pronto!"
echo "   Frontend: http://localhost:3000"
echo "   API Docs: http://localhost:8000/api/docs"
echo ""
echo "Para parar: pkill -f 'kubectl port-forward'"
