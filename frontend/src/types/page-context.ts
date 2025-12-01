/**
 * Page context sent to the ChatKit backend via X-Page-Context header.
 *
 * The backend requires channelCode and instance for multi-tenant thread isolation.
 */
export interface PageContext {
  /**
   * The channel code (e.g. 'ETP-clippy').
   * NOTE: Both channel code and instance are required to uniquely identify a tenant.
   */
  channelCode: string;

  /**
   * The instance for the channel (e.g. 'uk', 'us').
   * NOTE: Both channel code and instance are required to uniquely identify a tenant.
   */
  instance: string;

  /**
   * The entity type, e.g. "program line" or "trading program".
   */
  entityType?: string;

  /**
   * The name of the page the user is on.
   */
  pageName?: string;

  /**
   * Entity state - application-specific data about the current context.
   */
  entityState?: Record<string, any>;

  /**
   * Permissible fields for agent instructions.
   */
  permissibleFields?: any[];

  /**
   * The current window path (window.location.pathname).
   * Sent with every request to provide navigation context.
   */
  currentPath?: string;
}
