
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Payment schemas
export const PaymentSchema = z.object({
    id: z.string(),
    userId: z.string(),
    subscriptionId: z.string().nullable(),
    serviceRequestId: z.string().nullable(),
    amount: z.number(),
    status: z.enum(['pending', 'completed', 'failed', 'refunded']),
    paymentMethod: z.string(),
    razorpayPaymentId: z.string().nullable(),
    razorpayOrderId: z.string().nullable(),
    franchiseId: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const PaymentWithRelationsSchema = PaymentSchema.extend({
    user: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
    }).optional(),
    subscription: z.object({
        id: z.string(),
        planName: z.string(),
    }).nullable().optional(),
    franchise: z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
    }).optional(),
});

// Revenue tracking schemas
export const RevenueItemSchema = z.object({
    id: z.string(),
    amount: z.number(),
    type: z.string(),
    status: z.string(),
    paymentMethod: z.string(),
    razorpayPaymentId: z.string().nullable(),
    razorpayOrderId: z.string().nullable(),
    razorpaySubscriptionId: z.string().nullable(),
    collectedByAgentId: z.string().nullable(),
    receiptImage: z.string().nullable(),
    dueDate: z.string().nullable(),
    paidDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    
    customer: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        city: z.string()
    }),
    
    subscription: z.object({
        id: z.string(),
        planName: z.string(),
        monthlyAmount: z.number(),
        depositAmount: z.number(),
        status: z.string(),
        startDate: z.string(),
        endDate: z.string()
    }).nullable(),
    
    franchise: z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        ownerName: z.string()
    }),
    
    serviceRequest: z.object({
        id: z.string(),
        type: z.string(),
        description: z.string(),
        status: z.string()
    }).nullable(),
    
    installationRequest: z.object({
        id: z.string(),
        name: z.string(),
        orderType: z.string(),
        status: z.string()
    }).nullable(),
    
    agent: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string()
    }).nullable()
});

export const RevenueDetailsSchema = RevenueItemSchema.extend({
    customer: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        city: z.string(),
        joinedDate: z.string()
    }),
    
    subscription: z.object({
        id: z.string(),
        planName: z.string(),
        monthlyAmount: z.number(),
        depositAmount: z.number(),
        status: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        currentPeriodStartDate: z.string(),
        currentPeriodEndDate: z.string(),
        nextPaymentDate: z.string()
    }).nullable(),
    
    franchise: z.object({
        id: z.string(),
        name: z.string(),
        city: z.string(),
        ownerName: z.string(),
        ownerPhone: z.string()
    }),
    
    serviceRequest: z.object({
        id: z.string(),
        type: z.string(),
        description: z.string(),
        status: z.string(),
        scheduledDate: z.string().nullable(),
        completedDate: z.string().nullable()
    }).nullable(),
    
    installationRequest: z.object({
        id: z.string(),
        name: z.string(),
        orderType: z.string(),
        status: z.string(),
        scheduledDate: z.string().nullable(),
        completedDate: z.string().nullable(),
        address: z.string().nullable()
    }).nullable(),
    
    agent: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        role: z.string()
    }).nullable(),
    
    product: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        rentPrice: z.number(),
        buyPrice: z.number(),
        deposit: z.number()
    }).nullable()
});

export const PaginationSchema = z.object({
    limit: z.number().nullable(),
    offset: z.number().nullable(),
    hasMore: z.boolean()
});

export const ErrorResponseSchema = z.object({
    statusCode: z.number(),
    error: z.string(),
    message: z.string(),
});

// Response schemas
export const GetPaymentsResponseSchema = z.object({
    payments: z.array(PaymentWithRelationsSchema),
    total: z.number(),
});

export const GetPaymentByIdResponseSchema = z.object({
    payment: PaymentWithRelationsSchema,
});

export const GetRevenueListResponseSchema = z.object({
    success: z.boolean(),
    revenueList: z.array(RevenueItemSchema),
    totalCount: z.number(),
    pagination: PaginationSchema
});

export const GetRevenueDetailsResponseSchema = z.object({
    success: z.boolean(),
    revenueDetails: RevenueDetailsSchema
});

// Query parameter schemas
export const RevenueListQuerySchema = z.object({
    franchiseId: z.string().optional(),
    subscriptionId: z.string().optional(),
    status: z.string().optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    limit: z.string().transform(val => parseInt(val)).pipe(z.number().min(1).max(100)).optional(),
    offset: z.string().transform(val => parseInt(val)).pipe(z.number().min(0)).optional()
});

// Route schemas
export const getPaymentsSchema = {
    response: {
        200: zodToJsonSchema(GetPaymentsResponseSchema),
        401: zodToJsonSchema(ErrorResponseSchema),
        403: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["payments"],
    summary: "Get payments based on user role",
    description: "Admin sees all payments, franchise owner sees franchise payments, customer sees own payments",
    security: [{ bearerAuth: [] }],
};

export const getPaymentByIdSchema = {
    params: zodToJsonSchema(z.object({
        id: z.string(),
    })),
    response: {
        200: zodToJsonSchema(GetPaymentByIdResponseSchema),
        401: zodToJsonSchema(ErrorResponseSchema),
        403: zodToJsonSchema(ErrorResponseSchema),
        404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["payments"],
    summary: "Get payment by ID",
    description: "Get specific payment with role-based access control",
    security: [{ bearerAuth: [] }],
};

export const getRevenueListSchema = {
    querystring: zodToJsonSchema(RevenueListQuerySchema),
    response: {
        200: zodToJsonSchema(GetRevenueListResponseSchema),
        400: zodToJsonSchema(ErrorResponseSchema),
        401: zodToJsonSchema(ErrorResponseSchema),
        403: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["payments"],
    summary: "Get revenue list for admin",
    description: "Get comprehensive revenue list with franchise and subscription details (admin only)",
    security: [{ bearerAuth: [] }],
};

export const getRevenueDetailsSchema = {
    params: zodToJsonSchema(z.object({
        id: z.string(),
    })),
    response: {
        200: zodToJsonSchema(GetRevenueDetailsResponseSchema),
        400: zodToJsonSchema(ErrorResponseSchema),
        401: zodToJsonSchema(ErrorResponseSchema),
        403: zodToJsonSchema(ErrorResponseSchema),
        404: zodToJsonSchema(ErrorResponseSchema),
    },
    tags: ["payments"],
    summary: "Get revenue details for admin",
    description: "Get detailed revenue information for a specific payment (admin only)",
    security: [{ bearerAuth: [] }],
};
