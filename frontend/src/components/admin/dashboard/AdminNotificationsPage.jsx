import React from "react";
import NotificationList from "../../notifications/NotificationList";

export default function AdminNotificationsPage() {
  return (
    <NotificationList
      endpoint="/admin/notifications"
      title="Notifications"
      subtitle="Admin workflow alerts, artwork reviews, production updates and internal notes"
    />
  );
}
