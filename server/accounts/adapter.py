from allauth.account.adapter import DefaultAccountAdapter


class AccountAdapter(DefaultAccountAdapter):
    # The right password for an inactive account answers a bare 401. Remember whose it was, so /me can tell the
    # account page whether it waits for approval or had its access removed (rejected or deactivated).
    def respond_user_inactive(self, request, user):
        request.session["pod_pending"] = user.pk
        return super().respond_user_inactive(request, user)
