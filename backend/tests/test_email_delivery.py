from email_delivery import EmailDeliverySettings, _build_message, _truthy


def settings(**overrides):
    values = {
        "from_email": "help@fandomforge.co.za",
        "from_name": "FandomForge Support",
        "reply_to": "help@fandomforge.co.za",
        "smtp_host": "smtp.example.test",
        "smtp_port": 587,
        "smtp_username": "",
        "smtp_password": "",
        "smtp_starttls": True,
        "smtp_ssl": False,
        "sendmail_path": "",
        "max_attempts": 5,
        "poll_seconds": 30,
    }
    values.update(overrides)
    return EmailDeliverySettings(**values)


def test_smtp_delivery_settings_are_recognised_as_configured():
    config = settings()
    assert config.configured is True
    assert config.provider == "smtp"


def test_unconfigured_delivery_is_reported_safely():
    config = settings(smtp_host="", sendmail_path="")
    assert config.configured is False
    assert config.provider == "unconfigured"


def test_queued_email_message_uses_fandomforge_support_identity():
    message = _build_message(
        {
            "id": "mail-123",
            "recipient_email": "creator@example.test",
            "subject": "FandomForge payout sent",
            "body": "Your Friday payout was processed.",
        },
        settings(),
    )

    assert message["From"] == "FandomForge Support <help@fandomforge.co.za>"
    assert message["Reply-To"] == "help@fandomforge.co.za"
    assert message["To"] == "creator@example.test"
    assert message["X-FandomForge-Message-ID"] == "mail-123"
    assert "Friday payout" in message.get_content()


def test_boolean_environment_values_are_parsed_consistently():
    assert _truthy("true") is True
    assert _truthy("YES") is True
    assert _truthy("0") is False
    assert _truthy(None, default=True) is True
