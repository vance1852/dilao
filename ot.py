class OT:
    @staticmethod
    def apply(content, op):
        result = []
        index = 0
        for component in op:
            if 'retain' in component:
                retain = component['retain']
                result.append(content[index:index + retain])
                index += retain
            elif 'insert' in component:
                insert = component['insert']
                result.append(insert)
            elif 'delete' in component:
                delete = component['delete']
                index += delete
        result.append(content[index:])
        return ''.join(result)
    
    @staticmethod
    def transform(op1, op2):
        transformed_op = []
        i1 = i2 = 0
        offset1 = offset2 = 0
        
        while i1 < len(op1) or i2 < len(op2):
            if i1 < len(op1) and 'delete' in op1[i1]:
                transformed_op.append(op1[i1])
                offset1 += op1[i1]['delete']
                i1 += 1
                continue
            
            if i2 < len(op2) and 'delete' in op2[i2]:
                offset2 += op2[i2]['delete']
                i2 += 1
                continue
            
            if i1 >= len(op1):
                comp2 = op2[i2]
                if 'insert' in comp2:
                    transformed_op.append({'retain': len(comp2['insert'])})
                else:
                    transformed_op.append(comp2)
                i2 += 1
                continue
            
            if i2 >= len(op2):
                comp1 = op1[i1]
                transformed_op.append(comp1)
                i1 += 1
                continue
            
            comp1 = op1[i1]
            comp2 = op2[i2]
            
            if 'insert' in comp1 and 'insert' in comp2:
                len1 = len(comp1['insert'])
                len2 = len(comp2['insert'])
                if len1 <= len2:
                    transformed_op.append(comp1)
                    transformed_op.append({'retain': len1})
                    if len2 > len1:
                        op2[i2] = {'insert': comp2['insert'][len1:]}
                    else:
                        i2 += 1
                    i1 += 1
                else:
                    transformed_op.append({'insert': comp1['insert'][:len2]})
                    transformed_op.append({'retain': len2})
                    op1[i1] = {'insert': comp1['insert'][len2:]}
                    i2 += 1
            elif 'insert' in comp1:
                len1 = len(comp1['insert'])
                transformed_op.append(comp1)
                if 'retain' in comp2:
                    if comp2['retain'] > len1:
                        op2[i2] = {'retain': comp2['retain'] - len1}
                    else:
                        i2 += 1
                i1 += 1
            elif 'insert' in comp2:
                len2 = len(comp2['insert'])
                transformed_op.append({'retain': len2})
                if 'retain' in comp1:
                    if comp1['retain'] > len2:
                        op1[i1] = {'retain': comp1['retain'] - len2}
                    else:
                        i1 += 1
                i2 += 1
            else:
                len1 = comp1.get('retain', 0) or comp1.get('delete', 0)
                len2 = comp2.get('retain', 0) or comp2.get('delete', 0)
                
                if len1 <= len2:
                    if 'retain' in comp1 and 'retain' in comp2:
                        transformed_op.append(comp1)
                    elif 'delete' in comp1:
                        transformed_op.append(comp1)
                    
                    if len2 > len1:
                        if 'retain' in comp2:
                            op2[i2] = {'retain': len2 - len1}
                        else:
                            op2[i2] = {'delete': len2 - len1}
                    else:
                        i2 += 1
                    i1 += 1
                else:
                    if 'retain' in comp1 and 'retain' in comp2:
                        transformed_op.append(comp2)
                    elif 'delete' in comp2:
                        pass
                    
                    if len1 > len2:
                        if 'retain' in comp1:
                            op1[i1] = {'retain': len1 - len2}
                        else:
                            op1[i1] = {'delete': len1 - len2}
                    else:
                        i1 += 1
                    i2 += 1
        
        return transformed_op
    
    @staticmethod
    def create_insert_op(position, text):
        op = []
        if position > 0:
            op.append({'retain': position})
        op.append({'insert': text})
        return op
    
    @staticmethod
    def create_delete_op(position, length):
        op = []
        if position > 0:
            op.append({'retain': position})
        op.append({'delete': length})
        return op
    
    @staticmethod
    def diff(old_text, new_text):
        i = 0
        j = 0
        op = []
        
        while i < len(old_text) or j < len(new_text):
            if i < len(old_text) and j < len(new_text) and old_text[i] == new_text[j]:
                count = 0
                while i < len(old_text) and j < len(new_text) and old_text[i] == new_text[j]:
                    i += 1
                    j += 1
                    count += 1
                if count > 0:
                    op.append({'retain': count})
            elif j < len(new_text) and (i >= len(old_text) or old_text[i] != new_text[j]):
                insert_text = ''
                while j < len(new_text) and (i >= len(old_text) or old_text[i] != new_text[j]):
                    insert_text += new_text[j]
                    j += 1
                op.append({'insert': insert_text})
            elif i < len(old_text) and (j >= len(new_text) or old_text[i] != new_text[j]):
                delete_count = 0
                while i < len(old_text) and (j >= len(new_text) or old_text[i] != new_text[j]):
                    i += 1
                    delete_count += 1
                op.append({'delete': delete_count})
        
        return op
