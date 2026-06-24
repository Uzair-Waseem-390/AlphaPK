from rest_framework import generics, status
from rest_framework.response import Response

from .models import Category, Inventory, Product, Purchase, Shelf, Supplier
from .permissions import IsAdminOrSuperuser, IsAdminOrSuperuserOrReadOnly
from .selectors import (
    get_all_categories,
    get_all_inventory,
    get_all_products,
    get_all_purchases,
    get_all_shelves,
    get_all_suppliers,
    get_category_by_id,
    get_inventory_by_product_id,
    get_product_by_id,
    get_purchase_by_id,
    get_shelf_by_id,
    get_supplier_by_id,
)
from .serializers import (
    CategoryReadSerializer,
    CategoryWriteSerializer,
    InventoryReadSerializer,
    ProductReadSerializer,
    ProductWriteSerializer,
    PurchaseReadSerializer,
    PurchaseWriteSerializer,
    ShelfReadSerializer,
    ShelfWriteSerializer,
    SupplierReadSerializer,
    SupplierWriteSerializer,
)
from .services import (
    create_category,
    create_product,
    create_purchase,
    create_shelf,
    create_supplier,
    delete_category,
    delete_product,
    delete_purchase,
    delete_shelf,
    delete_supplier,
    update_category,
    update_product,
    update_purchase,
    update_shelf,
    update_supplier,
)


# ---------------------------------------------------------------------------
# Base mixin: eliminates duplicated get_serializer_class pattern
# ---------------------------------------------------------------------------

class ReadWriteSerializerMixin:
    """
    Mixin that serves separate read/write serializers from one view.
    Subclasses declare read_serializer_class and write_serializer_class.
    """

    read_serializer_class = None
    write_serializer_class = None

    def get_serializer_class(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return self.read_serializer_class
        return self.write_serializer_class


# ---------------------------------------------------------------------------
# Category views
# ---------------------------------------------------------------------------

class CategoryListCreateView(ReadWriteSerializerMixin, generics.ListCreateAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = CategoryReadSerializer
    write_serializer_class = CategoryWriteSerializer

    def get_queryset(self):
        return get_all_categories()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = create_category(
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            user=request.user,
        )
        return Response(CategoryReadSerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryRetrieveUpdateDestroyView(ReadWriteSerializerMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = CategoryReadSerializer
    write_serializer_class = CategoryWriteSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_category_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = update_category(
            pk=self.kwargs["pk"],
            name=serializer.validated_data.get("name"),
            description=serializer.validated_data.get("description"),
            user=request.user,
        )
        return Response(CategoryReadSerializer(category).data)

    def destroy(self, request, *args, **kwargs):
        delete_category(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Category deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Shelf views
# ---------------------------------------------------------------------------

class ShelfListCreateView(ReadWriteSerializerMixin, generics.ListCreateAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = ShelfReadSerializer
    write_serializer_class = ShelfWriteSerializer

    def get_queryset(self):
        return get_all_shelves()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shelf = create_shelf(
            name=serializer.validated_data["name"],
            description=serializer.validated_data.get("description", ""),
            user=request.user,
        )
        return Response(ShelfReadSerializer(shelf).data, status=status.HTTP_201_CREATED)


class ShelfRetrieveUpdateDestroyView(ReadWriteSerializerMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = ShelfReadSerializer
    write_serializer_class = ShelfWriteSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_shelf_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        shelf = update_shelf(
            pk=self.kwargs["pk"],
            name=serializer.validated_data.get("name"),
            description=serializer.validated_data.get("description"),
            user=request.user,
        )
        return Response(ShelfReadSerializer(shelf).data)

    def destroy(self, request, *args, **kwargs):
        delete_shelf(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Shelf deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Supplier views
# ---------------------------------------------------------------------------

class SupplierListCreateView(ReadWriteSerializerMixin, generics.ListCreateAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = SupplierReadSerializer
    write_serializer_class = SupplierWriteSerializer

    def get_queryset(self):
        return get_all_suppliers()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        supplier = create_supplier(
            name=serializer.validated_data["name"],
            code=serializer.validated_data["code"],
            user=request.user,
        )
        return Response(SupplierReadSerializer(supplier).data, status=status.HTTP_201_CREATED)


class SupplierRetrieveUpdateDestroyView(ReadWriteSerializerMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = SupplierReadSerializer
    write_serializer_class = SupplierWriteSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_supplier_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        supplier = update_supplier(
            pk=self.kwargs["pk"],
            name=serializer.validated_data.get("name"),
            code=serializer.validated_data.get("code"),
            user=request.user,
        )
        return Response(SupplierReadSerializer(supplier).data)

    def destroy(self, request, *args, **kwargs):
        delete_supplier(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Supplier deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Product views
# ---------------------------------------------------------------------------

class ProductListCreateView(ReadWriteSerializerMixin, generics.ListCreateAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = ProductReadSerializer
    write_serializer_class = ProductWriteSerializer

    def get_queryset(self):
        return get_all_products()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        product = create_product(
            name=d["name"],
            code=d["code"],
            category_id=d["category"].pk,
            shelf_id=d["shelf"].pk,
            user=request.user,
        )
        return Response(ProductReadSerializer(product).data, status=status.HTTP_201_CREATED)


class ProductRetrieveUpdateDestroyView(ReadWriteSerializerMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = ProductReadSerializer
    write_serializer_class = ProductWriteSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_product_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        product = update_product(
            pk=self.kwargs["pk"],
            name=d.get("name"),
            code=d.get("code"),
            category_id=d["category"].pk if "category" in d else None,
            shelf_id=d["shelf"].pk if "shelf" in d else None,
            user=request.user,
        )
        return Response(ProductReadSerializer(product).data)

    def destroy(self, request, *args, **kwargs):
        delete_product(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Product deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Purchase views
# ---------------------------------------------------------------------------

class PurchaseListCreateView(ReadWriteSerializerMixin, generics.ListCreateAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = PurchaseReadSerializer
    write_serializer_class = PurchaseWriteSerializer

    def get_queryset(self):
        return get_all_purchases()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        purchase = create_purchase(
            product_id=d["product"].pk,
            supplier_id=d["supplier"].pk,
            quantity=d["quantity"],
            unit_price=d["unit_price"],
            gst=d["gst"],
            wht=d["wht"],
            user=request.user,
        )
        return Response(PurchaseReadSerializer(purchase).data, status=status.HTTP_201_CREATED)


class PurchaseRetrieveUpdateDestroyView(ReadWriteSerializerMixin, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAdminOrSuperuser]
    read_serializer_class = PurchaseReadSerializer
    write_serializer_class = PurchaseWriteSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_purchase_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        purchase = update_purchase(
            pk=self.kwargs["pk"],
            product_id=d["product"].pk if "product" in d else None,
            supplier_id=d["supplier"].pk if "supplier" in d else None,
            quantity=d.get("quantity"),
            unit_price=d.get("unit_price"),
            gst=d.get("gst"),
            wht=d.get("wht"),
            user=request.user,
        )
        return Response(PurchaseReadSerializer(purchase).data)

    def destroy(self, request, *args, **kwargs):
        delete_purchase(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Purchase deleted and inventory updated."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Inventory views (read-only for all authenticated users)
# ---------------------------------------------------------------------------

class InventoryListView(generics.ListAPIView):
    permission_classes = [IsAdminOrSuperuserOrReadOnly]
    serializer_class = InventoryReadSerializer

    def get_queryset(self):
        return get_all_inventory()


class InventoryRetrieveView(generics.RetrieveAPIView):
    permission_classes = [IsAdminOrSuperuserOrReadOnly]
    serializer_class = InventoryReadSerializer

    def get_object(self):
        return get_inventory_by_product_id(self.kwargs["product_id"])