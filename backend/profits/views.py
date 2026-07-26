from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_all_monthly_profits,
    get_current_month_profit,
    get_investor_profit_payout_by_id,
    get_monthly_profit_by_period,
    get_net_profit_trend,
    get_ownership_split,
    get_profit_flow_stats,
)
from .serializers import (
    CurrentMonthProfitSerializer,
    InvestorProfitPayoutReadSerializer,
    InvestorProfitPayoutWriteSerializer,
    MonthlyProfitDetailSerializer,
    MonthlyProfitListSerializer,
    NetProfitTrendItemSerializer,
    OwnershipSplitSerializer,
    ProfitFlowStatsSerializer,
)
from .services import create_investor_profit_payout, delete_investor_profit_payout


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


# ---------------------------------------------------------------------------
# Monthly Profit
# ---------------------------------------------------------------------------

class MonthlyProfitListView(generics.ListAPIView):
    """
    GET /profits/monthly/
    Every finalized month, newest first. Running catch-up first (see
    profits.services.catch_up_monthly_profits) means this always includes
    every month up through the last fully-completed one, with no cron job.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = MonthlyProfitListSerializer

    def get_queryset(self):
        return get_all_monthly_profits()


class CurrentMonthProfitView(APIView):
    """
    GET /profits/monthly/current/
    Live, provisional figures for the still-open current month — never
    stored, always recomputed. No settle actions apply to this period.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        data = get_current_month_profit()
        serializer = CurrentMonthProfitSerializer(data)
        return Response(serializer.data)


class MonthlyProfitDetailView(APIView):
    """
    GET /profits/monthly/<period>/
    Full breakdown for one finalized month, plus every investor's snapshotted
    share and their full payout history.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request, period):
        obj = get_monthly_profit_by_period(period)
        serializer = MonthlyProfitDetailSerializer(obj)
        return Response(serializer.data)


class NetProfitTrendView(APIView):
    """
    GET /profits/net-profit-trend/?months=12
    Cheap read straight off stored MonthlyProfit rows — powers the
    dashboard's Net Profit Trend chart, no live aggregation.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        try:
            months = int(request.query_params.get("months", 12))
        except (TypeError, ValueError):
            months = 12
        months = max(1, min(months, 120))
        data = get_net_profit_trend(months=months)
        serializer = NetProfitTrendItemSerializer(data, many=True)
        return Response(serializer.data)


class ProfitFlowStatsView(APIView):
    """
    GET /profits/stats/
    All-time lifetime profit totals — O(1) after catch-up.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        data = get_profit_flow_stats()
        serializer = ProfitFlowStatsSerializer(data)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# InvestorProfitPayout
# ---------------------------------------------------------------------------

class InvestorProfitPayoutCreateView(APIView):
    """
    POST /profits/monthly/shares/<share_id>/payouts/
    Settles part or all of one investor's share for one month — either a
    real payout (cash out, capital account untouched) or a reinvest (cash
    out then immediately back in as a genuine new investment).
    """
    permission_classes = [IsAdminOrSuperuser]

    def post(self, request, share_id):
        serializer = InvestorProfitPayoutWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        payout = create_investor_profit_payout(
            share_id=share_id,
            amount=d["amount"],
            action_type=d["action_type"],
            payout_date=d["payout_date"],
            note=d.get("note", ""),
            user=request.user,
        )
        return Response(InvestorProfitPayoutReadSerializer(payout).data, status=status.HTTP_201_CREATED)


class InvestorProfitPayoutRetrieveDestroyView(generics.RetrieveDestroyAPIView):
    """
    GET    /profits/payouts/<pk>/
    DELETE /profits/payouts/<pk>/ — reverses cash_in_hand, the share's
    settled amounts, and (for a reinvest) the linked InvestorTransaction too.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvestorProfitPayoutReadSerializer

    def get_object(self):
        return get_investor_profit_payout_by_id(self.kwargs["pk"])

    def destroy(self, request, *args, **kwargs):
        delete_investor_profit_payout(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Payout reversed and cash in hand restored."}, status=status.HTTP_200_OK)
