from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.user_presence import UserPresence


PRESENCE_TIMEOUT_SECONDS = 30


def mark_user_online(
    db: Session,
    user_id: int,
) -> UserPresence:

    now = datetime.now(timezone.utc)

    presence = db.scalar(
        select(UserPresence).where(
            UserPresence.user_id == user_id
        )
    )

    if presence is None:
        presence = UserPresence(
            user_id=user_id,
            is_online=True,
            last_seen=now,
        )

        db.add(presence)

    else:
        presence.is_online = True
        presence.last_seen = now

    db.commit()
    db.refresh(presence)

    return presence


def mark_user_offline(
    db: Session,
    user_id: int,
) -> None:

    presence = db.scalar(
        select(UserPresence).where(
            UserPresence.user_id == user_id
        )
    )

    if presence is None:
        return

    presence.is_online = False
    presence.last_seen = datetime.now(
        timezone.utc
    )

    db.commit()


def get_user_presence(
    db: Session,
    user_id: int,
) -> UserPresence | None:

    presence = db.scalar(
        select(UserPresence).where(
            UserPresence.user_id == user_id
        )
    )

    if presence is None:
        return None

    now = datetime.now(timezone.utc)

    last_seen = presence.last_seen

    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(
            tzinfo=timezone.utc
        )

    if (
        presence.is_online
        and now - last_seen
        > timedelta(
            seconds=PRESENCE_TIMEOUT_SECONDS
        )
    ):
        presence.is_online = False
        db.commit()
        db.refresh(presence)

    return presence


def get_all_presence(
    db: Session,
) -> list[UserPresence]:

    presences = list(
        db.scalars(
            select(UserPresence)
        ).all()
    )

    now = datetime.now(timezone.utc)

    changed = False

    for presence in presences:

        last_seen = presence.last_seen

        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(
                tzinfo=timezone.utc
            )

        if (
            presence.is_online
            and now - last_seen
            > timedelta(
                seconds=PRESENCE_TIMEOUT_SECONDS
            )
        ):
            presence.is_online = False
            changed = True

    if changed:
        db.commit()

    return presences