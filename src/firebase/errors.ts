'use client';

export type SecurityRuleOperation = 'get' | 'list' | 'create' | 'update' | 'delete';

export type SecurityRuleContext = {
  path: string;
  operation: SecurityRuleOperation;
  requestResourceData?: any;
};

/**
 * A custom error to represent a Firestore security rule permission-denied error
 * with rich, actionable context for developers.
 */
export class FirestorePermissionError extends Error {
  public readonly context: SecurityRuleContext;

  constructor(context: SecurityRuleContext) {
    // This message is designed to be caught by the FirebaseErrorListener
    // and displayed in the Next.js error overlay.
    const prettyContext = JSON.stringify(
      {
        path: context.path,
        operation: context.operation,
        // In a real scenario, you'd want to get the auth state here if possible
        // but for this client-side error, we'll rely on the server denial message.
        requestData: context.requestResourceData,
      },
      null,
      2
    );

    const message = `FirestoreError: Missing or insufficient permissions. The request was denied by security rules.\n\nDEVELOPER CONTEXT:\n${prettyContext}`;

    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;

    // Restore the prototype chain
    Object.setPrototypeOf(this, FirestorePermissionError.prototype);
  }
}
