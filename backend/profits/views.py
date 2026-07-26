from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import get_ownership_split
from .serializers import OwnershipSplitSerializer


class BusinessWorthView(APIView):
    """
    GET /profits/business-worth/
    Total business worth (a live net-worth read, not a stored figure) plus
    the ownership split between every investor (by their theoretical,
    growth-compounded current_worth) and the owner (the residual).
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        data = get_ownership_split()
        serializer = OwnershipSplitSerializer(data)
        return Response(serializer.data)
