/**
 * Closed answers of the post-event survey's marketing questions, shared by
 * the survey form, the API and the admin results (client-safe). Stored as
 * plain strings (event_survey_responses.heard_from / would_recommend): adding
 * an option needs no migration, only a key here and its i18n labels.
 */

/** "How did you hear about this event?" — asked to every respondent. */
export const HEARD_FROM_OPTIONS = Object.freeze(['social', 'friend', 'calico', 'course_group', 'other']);

/** Free text kept only with `other` ("where?"). */
export const HEARD_FROM_DETAIL_MAX = 120;

/** "Would you recommend it?" — asked only to those who attended. */
export const RECOMMEND_OPTIONS = Object.freeze(['yes', 'maybe', 'no']);
