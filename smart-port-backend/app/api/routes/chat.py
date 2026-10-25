"""
Port Communication (chat) endpoints.

    GET  /chat/conversations
    POST /chat/conversations                   {user_id}
    GET  /chat/conversations/{id}/messages     ?after_id=&deleted_since=
    POST /chat/conversations/{id}/messages     {text, attachment?}
    POST /chat/conversations/{id}/read         {last_message_id}
    DELETE /chat/conversations                 delete ALL chats (for me only)
    DELETE /chat/conversations/{id}            delete the chat for me only
    DELETE /chat/conversations/{id}/messages/{message_id}?scope=me|everyone
    POST /chat/conversations/{id}/restore      bring a deleted chat back
    GET  /chat/archive                         deleted & archived chats
    GET  /chat/attachments/{id}

Deleting a chat (and the automatic 6-month archive) only hides it for
the logged-in account. Nothing is erased and the other person keeps
the chat.

Deleting one message: scope "me" hides it for the logged-in account
only; scope "everyone" (only for your own messages) turns it into
"This message was deleted" for everybody.

Every endpoint needs a valid login. app/main.py also requires
the "port_communication" feature for the whole router.
All data is limited to the conversations the logged-in account
takes part in.
"""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.models.user import User
from app.services import chat_service


def ensure_chat_tables(db: Session = Depends(get_db)) -> None:
    """Create the chat tables on first use."""

    chat_service.ensure_tables(db)


router = APIRouter(
    prefix="/chat",
    tags=["Port Communication"],
    dependencies=[Depends(ensure_chat_tables)],
)


# =========================================================
# REQUEST BODIES
# =========================================================


class StartConversation(BaseModel):
    user_id: int


class AttachmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=1000)
    mime: str | None = None
    data_base64: str = Field(min_length=1)


class MessageIn(BaseModel):
    text: str = ""
    attachment: AttachmentIn | None = None


class ReadIn(BaseModel):
    last_message_id: int = Field(ge=0)


# =========================================================
# ENDPOINTS
# =========================================================


@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Channels, started chats and colleagues to write to."""

    return chat_service.list_conversations(db, current_user.id)


@router.post("/conversations")
def start_conversation(
    data: StartConversation,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Open (or create) the one-to-one chat with a colleague."""

    return chat_service.get_or_create_direct(
        db,
        current_user.id,
        data.user_id,
    )


@router.get("/conversations/{conversation_id}/messages")
def list_messages(
    conversation_id: int,
    after_id: int = Query(default=0, ge=0),
    deleted_since: str = Query(default=""),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The newest 200 messages, or only those after `after_id` (plus the
    older ones deleted for everyone since `deleted_since`).
    """

    return chat_service.list_messages(
        db,
        current_user.id,
        conversation_id,
        after_id,
        deleted_since,
    )


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    data: MessageIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Send a text message and/or a document."""

    return chat_service.send_message(
        db,
        current_user.id,
        conversation_id,
        data.text,
        data.attachment,
    )


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: int,
    data: ReadIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The conversation is open on screen: everything up to
    `last_message_id` is read. This is what lowers the unread
    counters.
    """

    return chat_service.mark_read(
        db,
        current_user.id,
        conversation_id,
        data.last_message_id,
    )


@router.delete("/conversations")
def delete_all_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete ALL chats of the logged-in account at once (hidden for this
    account only, nothing is erased, every chat can be restored).
    """

    return chat_service.delete_all_chats(db, current_user.id)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete the chat for the logged-in account only (the messages
    are hidden, not erased, and can be restored).
    """

    return chat_service.delete_chat(
        db,
        current_user.id,
        conversation_id,
    )


@router.delete("/conversations/{conversation_id}/messages/{message_id}")
def delete_message(
    conversation_id: int,
    message_id: int,
    scope: str = Query(default="me"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete one message: scope "me" (hidden for me only) or
    "everyone" (your own message turns into "This message was
    deleted" for everybody).
    """

    return chat_service.delete_message(
        db,
        current_user.id,
        conversation_id,
        message_id,
        scope,
    )


@router.post("/conversations/{conversation_id}/restore")
def restore_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bring back a deleted or archived chat with its messages."""

    return chat_service.restore_chat(
        db,
        current_user.id,
        conversation_id,
    )


@router.get("/archive")
def list_archive(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deleted chats and chats archived after 6 months."""

    return chat_service.list_removed_chats(db, current_user.id)


@router.get("/attachments/{attachment_id}")
def get_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A shared document (only for members of its conversation)."""

    return chat_service.get_attachment(
        db,
        current_user.id,
        attachment_id,
    )