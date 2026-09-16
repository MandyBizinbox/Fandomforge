import React from "react";
import ActivityTimeline from "../../activity/ActivityTimeline";

export default function AdminActivityPage() {
  return (
    <div data-testid="admin-activity-page" className="ff-admin-page">
      <div className="ff-admin-page__inner">
        <div className="overline mb-2">Platform</div>
        <h1 className="font-display text-5xl uppercase mb-8">Activity Log</h1>
        <ActivityTimeline endpoint="/admin/activity-log" title="Recent Platform Activity" canAddNote={false} />
      </div>
    </div>
  );
}
