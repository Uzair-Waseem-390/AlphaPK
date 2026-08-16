from rest_framework import generics, status
from rest_framework.response import Response

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_all_payment_methods,
    get_payment_method_allocations,
    get_payment_method_by_id,
)
from .serializers import (
    PaymentAllocationReadSerializer,
    PaymentMethodReadSerializer,
    PaymentMethodWriteSerializer,
)
from .services import create_method, soft_delete_method, update_method


class PaymentMethodListCreateView(generics.ListCreateAPIView):
    """
    GET  /payment-methods/  — all accounts (Cash + any user-created ones)
    POST /payment-methods/  — create a new account

    Filter params for GET:
        search
    """
    permission_classes = [IsAdminOrSuperuser]

    def get_serializer_class(self):
        return PaymentMethodWriteSerializer if self.request.method == "POST" else PaymentMethodReadSerializer

    def get_queryset(self):
        return get_all_payment_methods(search=self.request.query_params.get("search"))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = create_method(**serializer.validated_data, user=request.user)
        return Response(PaymentMethodReadSerializer(obj).data, status=status.HTTP_201_CREATED)


class PaymentMethodRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /payment-methods/<pk>/
    PATCH  /payment-methods/<pk>/  — name/account_number only; blocked on the protected Cash row
    DELETE /payment-methods/<pk>/  — blocked unless balance is exactly 0; blocked on the protected Cash row
    """
    permission_classes = [IsAdminOrSuperuser]
    http_method_names   = ["get", "patch", "delete"]

    def get_serializer_class(self):
        return PaymentMethodWriteSerializer if self.request.method == "PATCH" else PaymentMethodReadSerializer

    def get_object(self):
        return get_payment_method_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = update_method(pk=self.kwargs["pk"], user=request.user, **serializer.validated_data)
        return Response(PaymentMethodReadSerializer(obj).data)

    def destroy(self, request, *args, **kwargs):
        soft_delete_method(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Payment method deleted."}, status=status.HTTP_200_OK)


class PaymentMethodAllocationListView(generics.ListAPIView):
    """
    GET /payment-methods/<pk>/allocations/
    Read-only transaction history for one method — every active
    PaymentAllocation row it has ever been part of.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class    = PaymentAllocationReadSerializer

    def get_queryset(self):
        return get_payment_method_allocations(payment_method_id=self.kwargs["pk"])
